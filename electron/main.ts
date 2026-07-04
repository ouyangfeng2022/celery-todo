/**
 * @file Electron 主进程
 * @description 创建窗口、系统托盘、开机自启、窗口位置记忆
 */

import { app, BrowserWindow, Menu, Tray, ipcMain } from 'electron';
import * as path from 'path';
import { createTray } from './tray';
import { registerStorageIpc } from './storage';
import type { AppWithIsQuitting } from './types';

// ============================================
// 全局变量
// ============================================

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

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
    // macOS 隐藏标题栏但保留红绿灯按钮；Windows 隐藏标题栏文字 + 自带 overlay 控制按钮
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    // Windows/Linux 通过 overlay 保留原生最小化/最大化/关闭按钮。
    // 应用默认启动即专注模式，初始颜色对齐 --bg-primary（纸色），避免启动瞬间色差。
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

// 单实例锁
const gotTheLock = app.requestSingleInstanceLock();
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
    mainWindow = createMainWindow();
    tray = createTray(mainWindow);
    registerStorageIpc();

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
