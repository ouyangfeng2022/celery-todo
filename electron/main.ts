/**
 * @file Electron 主进程
 * @description 创建窗口、系统托盘、开机自启、窗口位置记忆
 */

import { app, BrowserWindow, Menu, Tray, ipcMain, shell, screen } from 'electron';
import * as path from 'path';
import { createTray } from './tray';
import { registerStorageIpc } from './storage';
import { initUpdater, registerUpdaterIpc } from './updater';
import { initCliServer, shutdownCliServer } from './cli-server';
import { applyInstallOptionsOnce, consumePendingAutoStartSync } from './install-options';
import type { AppWithIsQuitting } from './types';

// ============================================
// 全局变量
// ============================================

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const stickerWindows = new Map<string, BrowserWindow>();
type StickerState = { id: string; projectId: string; bounds?: Electron.Rectangle };
let stickerStates: StickerState[] = [];

function saveStickerStates(): void {
  try {
    const storePath = getStorePath();
    const existing = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf-8')) : {};
    fs.writeFileSync(storePath, JSON.stringify({ ...existing, stickers: stickerStates }, null, 2));
  } catch {
    // 写入失败时保留当前会话状态，不中断贴图操作。
  }
}

function createStickerWindow(id: string, projectId = ''): void {
  const existing = stickerWindows.get(id);
  if (existing) { existing.show(); existing.focus(); return; }
  const state = stickerStates.find((item) => item.id === id) ?? { id, projectId };
  if (!stickerStates.some((item) => item.id === id)) stickerStates.push(state);
  const index = stickerStates.indexOf(state);
  const display = screen.getPrimaryDisplay().workArea;
  const bounds = state.bounds;
  const window = new BrowserWindow({
    width: bounds?.width ?? 380, height: bounds?.height ?? 520,
    x: bounds?.x ?? display.x + display.width - 404 - index * 28,
    y: bounds?.y ?? display.y + display.height - 544 - index * 28,
    minWidth: 340, minHeight: 420, maxWidth: 460, maxHeight: 680,
    frame: false, transparent: true, backgroundColor: '#00000000', alwaysOnTop: true,
    skipTaskbar: true, resizable: true, title: 'Celery Todo 简洁模式', hasShadow: false,
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  window.setHasShadow(false);
  stickerWindows.set(id, window);
  const persist = () => { state.bounds = window.getBounds(); saveStickerStates(); };
  window.on('move', persist); window.on('resize', persist);
  window.on('closed', () => { stickerWindows.delete(id); stickerStates = stickerStates.filter((item) => item.id !== id); saveStickerStates(); });
  if (isDev) window.loadURL(`${devServerUrl}?sticker=${encodeURIComponent(id)}&project=${encodeURIComponent(state.projectId)}`);
  else window.loadFile(path.join(__dirname, '../dist/index.html'), { query: { sticker: id, project: state.projectId } });
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
    backgroundColor: '#faf9f7',
    icon: iconPath,
    // macOS 隐藏标题栏但保留红绿灯按钮；Windows 隐藏标题栏文字 + 自带 overlay 控制按钮
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    // Windows/Linux 通过 overlay 保留原生最小化/最大化/关闭按钮。
    // 初始颜色对齐完整主窗口的标题栏背景。
    titleBarOverlay: !isMac
      ? {
          color: '#faf9f7',
          symbolColor: '#5c584c',
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
        submenu: [
          { role: 'quit' },
        ],
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
  try {
    const storePath = getStorePath();
    const data = { bounds };
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
  } catch {
    // 保存失败时静默处理
  }
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
    registerStorageIpc();
    registerUpdaterIpc();
    // 自动升级：绑定事件转发（开发环境下 IPC 内部会短路）
    if (mainWindow) initUpdater(mainWindow);
    // CLI IPC 服务器：监听本地 socket/命名管道，接收 CLI 请求并转发给渲染进程
    if (mainWindow) initCliServer(mainWindow);

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
  shutdownCliServer();
  tray?.destroy();
});

// ============================================
// IPC 处理
// ============================================

/** 设置开机自启 */
ipcMain.handle('set-auto-start', (_event, enabled: boolean) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
  });
});

/** 获取窗口位置 */
ipcMain.handle('get-window-bounds', () => {
  return mainWindow?.getBounds() ?? getSavedBounds();
});

/** 保存窗口位置 */
ipcMain.handle('save-window-bounds', (_event, bounds: { x: number; y: number; width: number; height: number }) => {
  saveBoundsToStore(bounds);
});

ipcMain.handle('sticker:create', (_event, projectId = '') => {
  const id = crypto.randomUUID();
  createStickerWindow(id, projectId);
  mainWindow?.hide();
});
ipcMain.handle('sticker:set-project', (event, id: string, projectId: string) => {
  const window = stickerWindows.get(id);
  if (!window || event.sender.id !== window.webContents.id) return;
  const state = stickerStates.find((item) => item.id === id);
  if (state) { state.projectId = projectId; saveStickerStates(); }
});
ipcMain.handle('sticker:close', (event, id: string) => {
  const window = stickerWindows.get(id);
  if (window && event.sender.id === window.webContents.id) window.close();
});

/** 显示托盘通知 */
ipcMain.handle('show-tray-notification', (_event, title: string, body: string) => {
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
ipcMain.handle(
  'set-titlebar-overlay',
  (_event, options: { color: string; symbolColor: string }) => {
    if (mainWindow && typeof mainWindow.setTitleBarOverlay === 'function') {
      mainWindow.setTitleBarOverlay(options);
    }
  },
);

// 导出供其他模块使用
export { mainWindow, tray };
