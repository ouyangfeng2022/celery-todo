/**
 * @file Electron 主进程
 * @description 创建窗口、系统托盘、开机自启、窗口位置记忆
 */

import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  nativeTheme,
  shell,
  screen,
} from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import * as path from 'path';
import { createTray } from './tray';
import { registerStorageIpc } from './storage';
import {
  closeRepository,
  notifyRepositoryFullRefresh,
  registerRepositoryIpc,
  setDataChangedListener,
  type DataChangedEvent as RepositoryDataChangedEvent,
} from './database-repository';
import { initUpdater, registerUpdaterIpc } from './updater';
import { initCliServer, shutdownCliServer } from './cli-server';
import { applyInstallOptionsOnce, consumePendingAutoStartSync } from './install-options';
import { requireAuthorizedSender } from './ipc-auth';
import type { AppWithIsQuitting } from './types';

// ============================================
// 全局变量
// ============================================

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const stickerWindows = new Map<string, BrowserWindow>();
type StickerState = { id: string; projectId: string; bounds?: Electron.Rectangle };
type StartupTheme =
  | 'default-light'
  | 'default-dark'
  | 'default-system'
  | 'paper-light'
  | 'paper-dark'
  | 'paper-system'
  | 'celery-light'
  | 'celery-dark'
  | 'celery-system';
let stickerStates: StickerState[] = [];
let pendingWindowBounds: Electron.Rectangle | undefined;
let windowStateSaveTimer: NodeJS.Timeout | null = null;
/**
 * 数据库落盘事件的全局序号与短窗口合并器。
 *
 * renderer 的保存队列已保证单窗口内快照按序写入，但主窗口与多个贴图可在很短时间
 * 内分别完成保存。逐条转发会让每个接收 renderer 连续重建 sql.js 数据库；在这里
 * 合成一轮广播后，接收端现有的 coalesced task 只需重载一次最终快照。
 */
let dataChangeVersion = 0;
let dataChangeBroadcastTimer: NodeJS.Timeout | null = null;
let downloadEventsRegistered = false;
const pendingDataChangeSenderIds = new Set<number>();
const pendingDataChangePatches = new Map<number, unknown>();
/** 同一发送者在合并窗口内多次落盘时，局部补丁无法代表中间所有项目变更。 */
const pendingFullSyncSenderIds = new Set<number>();

/** 仅完整主窗口可调用会改变系统或应用级配置的 IPC。 */
function isMainWindowSender(event: IpcMainInvokeEvent): boolean {
  return event.sender === mainWindow?.webContents;
}

/** 主窗口与已注册贴图窗口都可同步同一份数据库。 */
function isAppWindowSender(event: IpcMainInvokeEvent): boolean {
  if (isMainWindowSender(event)) return true;
  return [...stickerWindows.values()].some((window) => event.sender === window.webContents);
}

function requireMainWindowSender(event: IpcMainInvokeEvent): void {
  requireAuthorizedSender(event, isMainWindowSender);
}

/** 下载完成后才回传实际落盘路径，避免在文件仍写入时误报“导出成功”。 */
function registerDownloadEvents(window: BrowserWindow): void {
  if (downloadEventsRegistered) return;
  downloadEventsRegistered = true;
  window.webContents.session.on('will-download', (event, item, webContents) => {
    item.once('done', (_doneEvent, state) => {
      if (state !== 'completed' || webContents.isDestroyed()) return;
      const filePath = item.getSavePath();
      webContents.send('export:completed', {
        // Chromium 可能为重名文件追加 " (1)"；提示要展示真实写入的文件名。
        fileName: path.basename(filePath),
        filePath,
      });
    });
  });
}

/** 合并短时间内的多次持久化通知，并仅通知确实需要同步的窗口。 */
function scheduleDataChangedBroadcast(senderId: number, patch?: unknown): void {
  pendingDataChangeSenderIds.add(senderId);
  // 单个补丁只覆盖“本次保存以来”变动的项目，不能用后一份补丁覆盖前一份。
  // 同一窗口在 50ms 内连续落盘时，接收端改为完整重载，保证不会遗漏早一轮的项目。
  if (pendingDataChangePatches.has(senderId)) {
    pendingFullSyncSenderIds.add(senderId);
  } else {
    pendingDataChangePatches.set(senderId, patch);
  }
  if (dataChangeBroadcastTimer) return;

  dataChangeBroadcastTimer = setTimeout(() => {
    dataChangeBroadcastTimer = null;
    const changedBy = new Set(pendingDataChangeSenderIds);
    pendingDataChangeSenderIds.clear();
    const patches = new Map(pendingDataChangePatches);
    pendingDataChangePatches.clear();
    const needsFullSync = pendingFullSyncSenderIds.size > 0;
    pendingFullSyncSenderIds.clear();
    const version = ++dataChangeVersion;
    // 多写入者的快照不存在全序保证；此时宁可走既有整库重载，不能错误合并补丁。
    const patch =
      changedBy.size === 1 && !needsFullSync ? patches.get([...changedBy][0]!) : undefined;

    // 仅开发环境输出：可直接量化一次合并广播压缩了多少次 renderer 持久化通知。
    // 生产环境不记录，避免主进程日志噪声。
    if (!app.isPackaged) {
      console.debug('[perf] data-sync-batch', {
        version,
        senderCount: changedBy.size,
      });
    }

    const notify = (window: BrowserWindow | null) => {
      if (!window || window.isDestroyed()) return;
      // 发送者也接收版本号，以便后续远端事件能可靠检测版本断档；单一发送者无需
      // 再应用自己的补丁。多写入者统一回退整库重载，避免并发快照相互覆盖。
      const shouldApply = changedBy.size > 1 || !changedBy.has(window.webContents.id);
      window.webContents.send('data:changed', { version, shouldApply, patch });
    };

    notify(mainWindow);
    for (const window of stickerWindows.values()) notify(window);
  }, 50);
}

/** 原生仓储提交后广播细粒度影响范围；不与旧 renderer 同步事件混用。 */
function broadcastRepositoryChanged(event: RepositoryDataChangedEvent): void {
  const { originWebContentsId, ...publicEvent } = event;
  const notify = (window: BrowserWindow | null): void => {
    if (!window || window.isDestroyed()) return;
    if (window.webContents.id === originWebContentsId) return;
    window.webContents.send('data:changed:v2', publicEvent);
  };
  notify(mainWindow);
  for (const window of stickerWindows.values()) notify(window);
}

const STARTUP_THEME_COLORS = {
  'default-light': { backgroundColor: '#f9f9f7', overlayColor: '#f9f9f7', symbolColor: '#141413' },
  'default-dark': { backgroundColor: '#1a1916', overlayColor: '#33251f', symbolColor: '#f3f1ec' },
  'paper-light': { backgroundColor: '#faf9f5', overlayColor: '#e3dacc', symbolColor: '#141413' },
  'paper-dark': { backgroundColor: '#211b18', overlayColor: '#3d3028', symbolColor: '#f6eee8' },
  'celery-light': { backgroundColor: '#f9fbf7', overlayColor: '#eef3ea', symbolColor: '#263126' },
  'celery-dark': { backgroundColor: '#182018', overlayColor: '#263226', symbolColor: '#edf4e9' },
} as const;

function getStartupThemeColors(theme: StartupTheme) {
  if (theme.endsWith('-system')) {
    const name = theme.replace('-system', '') as 'default' | 'paper' | 'celery';
    return STARTUP_THEME_COLORS[`${name}-${nativeTheme.shouldUseDarkColors ? 'dark' : 'light'}`];
  }
  return STARTUP_THEME_COLORS[theme as keyof typeof STARTUP_THEME_COLORS];
}

/** 合并写入窗口与贴图状态；只在拖拽结束后的防抖窗口或退出时实际落盘。 */
function writeWindowState(): void {
  try {
    const storePath = getStorePath();
    const existing = fs.existsSync(storePath)
      ? JSON.parse(fs.readFileSync(storePath, 'utf-8'))
      : {};
    fs.writeFileSync(
      storePath,
      JSON.stringify(
        { ...existing, bounds: pendingWindowBounds ?? existing.bounds, stickers: stickerStates },
        null,
        2,
      ),
    );
  } catch {
    // 写入失败时保留当前会话状态，不中断贴图操作。
  }
}

/** move / resize 事件可在拖拽期间高频触发，合并为一次状态文件写入。 */
function scheduleWindowStateSave(bounds?: Electron.Rectangle): void {
  if (bounds) pendingWindowBounds = bounds;
  if (windowStateSaveTimer) clearTimeout(windowStateSaveTimer);
  windowStateSaveTimer = setTimeout(() => {
    windowStateSaveTimer = null;
    writeWindowState();
  }, 300);
}

/** 退出/关闭时同步刷盘，避免防抖窗口内的最后一次位置变化丢失。 */
function flushWindowStateSave(): void {
  if (windowStateSaveTimer) {
    clearTimeout(windowStateSaveTimer);
    windowStateSaveTimer = null;
  }
  writeWindowState();
}

function createStickerWindow(id: string, projectId = ''): void {
  const existing = stickerWindows.get(id);
  if (existing) {
    existing.show();
    existing.focus();
    return;
  }
  const state = stickerStates.find((item) => item.id === id) ?? { id, projectId };
  if (!stickerStates.some((item) => item.id === id)) stickerStates.push(state);
  const index = stickerStates.indexOf(state);
  const display = screen.getPrimaryDisplay().workArea;
  const bounds = state.bounds;
  const window = new BrowserWindow({
    width: bounds?.width ?? 340,
    height: bounds?.height ?? 460,
    x: bounds?.x ?? display.x + display.width - 364 - index * 28,
    y: bounds?.y ?? display.y + display.height - 484 - index * 28,
    minWidth: 300,
    minHeight: 380,
    maxWidth: 420,
    maxHeight: 620,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    title: 'Celery Todo 简洁模式',
    hasShadow: false,
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.setHasShadow(false);
  stickerWindows.set(id, window);
  const persist = () => {
    state.bounds = window.getBounds();
    scheduleWindowStateSave();
  };
  window.on('move', persist);
  window.on('resize', persist);
  window.on('closed', () => {
    stickerWindows.delete(id);
    stickerStates = stickerStates.filter((item) => item.id !== id);
    flushWindowStateSave();
  });
  if (isDev)
    window.loadURL(
      `${devServerUrl}?sticker=${encodeURIComponent(id)}&project=${encodeURIComponent(state.projectId)}`,
    );
  else
    window.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { sticker: id, project: state.projectId },
    });
}

// ============================================
// 开发/生产环境判断
// ============================================

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

// ============================================
// 创建主窗口
// ============================================

function createMainWindow(): BrowserWindow {
  // 读取上次窗口位置
  const savedBounds = getSavedBounds();
  const startupColors = getStartupThemeColors(getSavedStartupTheme());

  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';

  // 窗口图标：dev/prod 路径不同。Electron 在 Windows/Linux 上需要 PNG/ICO（SVG 不支持），
  // macOS 由 .icon.icns 在打包时注入，这里给 PNG 也能在 dock 上正常显示。
  const iconPath = isDev
    ? path.join(__dirname, '../public/icon.png') // dev: 源仓库 public/
    : path.join(process.resourcesPath, 'icon.png'); // prod: electron-builder 把 public/* 当作资源打包

  const window = new BrowserWindow({
    width: savedBounds?.width ?? 1200,
    height: savedBounds?.height ?? 800,
    x: savedBounds?.x,
    y: savedBounds?.y,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: 'Celery Todo',
    backgroundColor: startupColors.backgroundColor,
    icon: iconPath,
    // macOS 隐藏标题栏但保留红绿灯按钮；Windows 隐藏标题栏文字 + 自带 overlay 控制按钮
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    // Windows/Linux 通过 overlay 保留原生最小化/最大化/关闭按钮。
    // 首帧即使用上次主题的标题栏颜色，避免数据库初始化完成前闪出旧主题。
    titleBarOverlay: !isMac
      ? {
          color: startupColors.overlayColor,
          symbolColor: startupColors.symbolColor,
          height: 36,
        }
      : undefined,
    // Linux 无原生 overlay 支持，直接 frameless
    frame: isMac ? undefined : !isWin ? false : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  registerDownloadEvents(window);

  // 窗口准备好后再显示，避免白屏
  window.once('ready-to-show', () => {
    window.show();
  });

  // 移除默认菜单栏（Windows/Linux），macOS 保留系统菜单
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  } else {
    // macOS: 设置极简菜单，避免默认英文菜单栏
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: app.name,
        submenu: [{ role: 'quit' }],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  // 记忆窗口位置
  const saveBounds = () => {
    const bounds = window.getBounds();
    saveBoundsToStore(bounds);
  };
  window.on('resize', saveBounds);
  window.on('move', saveBounds);

  // 关闭时最小化到托盘（如果启用）
  window.on('close', (e) => {
    if ((app as AppWithIsQuitting).isQuitting) return;
    e.preventDefault();
    window.hide();
  });

  // 加载页面
  if (isDev) {
    window.loadURL(devServerUrl);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    window.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 拦截外部链接：Markdown 描述里的 url 等任何跳转都用系统默认浏览器打开，
  // 否则会在当前窗口内导航，把整个应用替换成目标页面、无法返回。
  // target=_blank / window.open 走这里
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  // 普通 <a href>（同窗口跳转）走这里
  window.webContents.on('will-navigate', (e, url) => {
    // 允许应用自身文件加载（dev server / 本地 index.html），仅拦截外链
    if (url === devServerUrl || url.startsWith('file://')) return;
    e.preventDefault();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
  });

  // 右键菜单：Electron 默认不弹出原生右键菜单，需手动监听 context-menu 事件
  // 选中文本时提供 复制/剪切/粘贴 等原生菜单项
  window.webContents.on('context-menu', (_e, params) => {
    const hasText = Boolean(params.selectionText && params.selectionText.trim().length > 0);
    const template: Electron.MenuItemConstructorOptions[] = [
      { role: 'copy', enabled: hasText },
      { role: 'cut', enabled: hasText && params.isEditable },
      { role: 'paste', enabled: params.isEditable && params.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll' },
    ];
    Menu.buildFromTemplate(template).popup({ window });
  });

  return window;
}

// ============================================
// 窗口位置持久化（使用 electron-store 替代方案：JSON 文件）
// ============================================

import * as fs from 'fs';

function getStorePath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'window-state.json');
}

function getSavedStartupTheme(): StartupTheme {
  try {
    const storePath = getStorePath();
    if (fs.existsSync(storePath)) {
      const theme = JSON.parse(fs.readFileSync(storePath, 'utf-8')).theme;
      if (theme === 'light') return 'default-light';
      if (theme === 'dark') return 'default-dark';
      if (theme === 'system') return 'default-system';
      if (theme === 'paper') return 'paper-light';
      if (theme === 'celery') return 'celery-light';
      if (
        theme === 'default-light' ||
        theme === 'default-dark' ||
        theme === 'default-system' ||
        theme === 'paper-light' ||
        theme === 'paper-dark' ||
        theme === 'paper-system' ||
        theme === 'celery-light' ||
        theme === 'celery-dark' ||
        theme === 'celery-system'
      )
        return theme;
    }
  } catch {
    // 读取失败时沿用默认的跟随系统主题。
  }
  return 'default-system';
}

function saveStartupTheme(theme: StartupTheme): void {
  try {
    const storePath = getStorePath();
    const existing = fs.existsSync(storePath)
      ? JSON.parse(fs.readFileSync(storePath, 'utf-8'))
      : {};
    fs.writeFileSync(storePath, JSON.stringify({ ...existing, theme }, null, 2));
  } catch {
    // 持久化失败不影响当前会话，渲染进程仍会即时切换主题。
  }
}

function getSavedBounds(): { x: number; y: number; width: number; height: number } | null {
  try {
    const storePath = getStorePath();
    if (fs.existsSync(storePath)) {
      const data = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
      stickerStates = Array.isArray(data.stickers) ? data.stickers : [];
      return data.bounds;
    }
  } catch {
    // 读取失败时使用默认值
  }
  return null;
}

function saveBoundsToStore(bounds: { x: number; y: number; width: number; height: number }): void {
  scheduleWindowStateSave(bounds);
}

// ============================================
// 应用生命周期
// ============================================

// 测试隔离钩子：通过环境变量重定向 userData，使 Playwright E2E 每次启动都用独立目录。
// 生产环境不设置该变量，userData 仍走默认路径（Windows: %APPDATA%\Celery Todo），零影响。
// 必须在 requestSingleInstanceLock() 之前调用，否则单实例锁路径不会随之改变。
const testUserData = process.env.CELERY_TODO_USERDATA;
if (testUserData) {
  app.setPath('userData', testUserData);
  // Playwright 连续冷启动时，Windows 的 GPU 进程偶发在 renderer 首次导航前崩溃。
  // E2E 不验证真实显卡，固定使用 Electron 自带的 SwiftShader ANGLE 后端，
  // 并关闭 Chromium sandbox（仅测试），避免本机安全软件/图形驱动在 GPU 子进程
  // 初始化时注入失败，导致 renderer 首帧崩溃。
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  app.commandLine.appendSwitch('no-sandbox');
  // 用 userData 目录名做 app.name 后缀，确保单实例锁命名管道独立，
  // 否则多实例共享 app.name 导致第二实例被 quit，测试卡死。
  app.setName(`celery-todo-e2e-${testUserData.split(/[/\\]/).pop()}`);
}

// 单实例锁（测试模式下禁用：每个测试实例用独立 userData，无需互斥）
const isTestMode = !!process.env.CELERY_TODO_USERDATA;
const gotTheLock = isTestMode || app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // 应用 NSIS 安装时用户选择的选项（自定义数据目录 / 开机自启）。
    // 必须在 createMainWindow 之前：storage-config.json 写好后，渲染进程
    // 首次发 storage:load 时就会落到用户期望的目录。
    applyInstallOptionsOnce();

    mainWindow = createMainWindow();
    tray = createTray(mainWindow, {
      createSticker: () => createStickerWindow(crypto.randomUUID()),
      showStickers: () => stickerWindows.forEach((window) => window.show()),
    });
    registerStorageIpc({
      isAppWindowSender,
      isMainWindowSender,
      beforeStoragePathChange: closeRepository,
      afterStoragePathChange: notifyRepositoryFullRefresh,
    });
    registerRepositoryIpc(isAppWindowSender);
    setDataChangedListener(broadcastRepositoryChanged);
    registerUpdaterIpc(isMainWindowSender);
    // 自动升级：绑定事件转发（开发环境下 IPC 内部会短路）
    if (mainWindow) initUpdater(mainWindow);
    // CLI IPC 服务器使用固定命名管道，测试进程强杀后短时间内可能残留。
    // E2E 不通过该桥接通信，测试模式不启动它，避免无关的启动竞争。
    if (mainWindow && !isTestMode) initCliServer(mainWindow);

    // 安装阶段勾选了开机自启时，主进程已写注册表；这里在 renderer 加载完成后
    // 推送一次，让它把 settings.autoStart 同步进 DB（保持设置面板 UI 一致）
    if (mainWindow) {
      mainWindow.webContents.once('did-finish-load', () => {
        if (consumePendingAutoStartSync() && mainWindow) {
          mainWindow.webContents.send('install-options:auto-start', true);
        }
      });
    }

    // macOS 激活应用
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
      } else {
        mainWindow?.show();
      }
    });
  });
}

// 所有窗口关闭时退出（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用退出前清理
app.on('before-quit', () => {
  (app as AppWithIsQuitting).isQuitting = true;
  flushWindowStateSave();
  shutdownCliServer();
  closeRepository();
  tray?.destroy();
});

// ============================================
// IPC 处理
// ============================================

/** 设置开机自启 */
ipcMain.handle('set-auto-start', (event, enabled: boolean) => {
  requireMainWindowSender(event);
  app.setLoginItemSettings({
    openAtLogin: enabled,
  });
});

/** 在系统文件管理器中选中已完成导出的文件。 */
ipcMain.handle('export:open-in-folder', (event, filePath: string) => {
  requireMainWindowSender(event);
  if (typeof filePath !== 'string' || !fs.existsSync(filePath)) return;
  shell.showItemInFolder(filePath);
});

/** 获取窗口位置 */
ipcMain.handle('get-window-bounds', (event) => {
  requireMainWindowSender(event);
  return mainWindow?.getBounds() ?? getSavedBounds();
});

/** 保存窗口位置 */
ipcMain.handle(
  'save-window-bounds',
  (event, bounds: { x: number; y: number; width: number; height: number }) => {
    requireMainWindowSender(event);
    saveBoundsToStore(bounds);
  },
);

ipcMain.handle('sticker:create', (event, projectId = '') => {
  requireMainWindowSender(event);
  const id = crypto.randomUUID();
  createStickerWindow(id, projectId);
  mainWindow?.hide();
});
ipcMain.handle('sticker:duplicate', (event, sourceId: string, projectId: string) => {
  const sourceWindow = stickerWindows.get(sourceId);
  if (!sourceWindow || event.sender.id !== sourceWindow.webContents.id) return;

  const sourceState = stickerStates.find((item) => item.id === sourceId);
  if (!sourceState) return;

  // 以当前窗口尺寸为准，向右下错开一小段，避免复制品与原贴图完全重叠。
  const bounds = sourceWindow.getBounds();
  sourceState.projectId = projectId;
  const id = crypto.randomUUID();
  stickerStates.push({
    id,
    projectId,
    bounds: { ...bounds, x: bounds.x + 28, y: bounds.y + 28 },
  });
  scheduleWindowStateSave();
  createStickerWindow(id, projectId);
});
ipcMain.handle('sticker:set-project', (event, id: string, projectId: string) => {
  const window = stickerWindows.get(id);
  if (!window || event.sender.id !== window.webContents.id) return;
  const state = stickerStates.find((item) => item.id === id);
  if (state) {
    state.projectId = projectId;
    scheduleWindowStateSave();
  }
});
ipcMain.handle('sticker:close', (event, id: string) => {
  const window = stickerWindows.get(id);
  if (window && event.sender.id === window.webContents.id) window.close();
});
// 「返回主窗口」：唤起主窗口 + 关闭当前贴图（仅这张，其它贴图不动）。
// 先 show 主窗口再 close 贴图，避免中间一帧所有窗口都不可见。
ipcMain.handle('sticker:return-main', (event, id: string) => {
  const window = stickerWindows.get(id);
  if (!window || event.sender.id !== window.webContents.id) return;
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  window.close();
});
// 贴图样式被改动时（主窗口的设置页 → store.updateSettings），向所有已打开的贴图窗口
// 广播一个事件。贴图是独立 renderer，不共享 React 状态，必须经主进程中转同步。
ipcMain.handle('sticker:style-changed', (event) => {
  requireMainWindowSender(event);
  for (const window of stickerWindows.values()) {
    window.webContents.send('sticker:style-changed');
  }
});

// 数据库已落盘：由发起方 renderer（database.persistDatabase 自动调用）触发。
// 主进程以 50ms 窗口合并连续通知，并携带单调递增版本号转发。Todo 局部补丁由
// renderer 生成，主进程只路由；同一批多发送者回退整库同步。单一发送者也接收版本
// 事件（但不重复应用自己的补丁），确保各窗口可检测后续版本断档。
ipcMain.handle('data:changed', (event, patch?: unknown) => {
  requireAuthorizedSender(event, isAppWindowSender);
  scheduleDataChangedBroadcast(event.sender.id, patch);
});

/** 显示托盘通知 */
ipcMain.handle('show-tray-notification', (event, title: string, body: string) => {
  requireMainWindowSender(event);
  if (mainWindow) {
    tray?.displayBalloon({
      title,
      content: body,
    });
  }
});

/**
 * 更新标题栏 overlay 颜色（与渲染进程主题同步）
 * 仅 Windows / Linux 生效，macOS 红绿灯按钮不受影响
 */
ipcMain.handle('set-titlebar-overlay', (event, options: { color: string; symbolColor: string }) => {
  requireMainWindowSender(event);
  if (mainWindow && typeof mainWindow.setTitleBarOverlay === 'function') {
    mainWindow.setTitleBarOverlay(options);
  }
});

/**
 * 更新 Windows 任务栏与系统托盘图标。
 * 图标由 renderer 将当前主题的 SVG 栅格化后传入，避免主进程依赖 Vite 资源路径。
 */
ipcMain.handle('set-app-icon', (event, dataUrl: string) => {
  requireMainWindowSender(event);
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) return;

  const icon = nativeImage.createFromDataURL(dataUrl);
  if (icon.isEmpty()) return;

  mainWindow?.setIcon(icon);
  tray?.setImage(process.platform === 'win32' ? icon.resize({ width: 16, height: 16 }) : icon);
});

/** 记录下次启动时的主题，让原生窗口首帧与渲染页面保持一致。 */
ipcMain.handle('set-startup-theme', (event, theme: StartupTheme) => {
  requireMainWindowSender(event);
  saveStartupTheme(theme);
});

// 导出供其他模块使用
export { mainWindow, tray };
