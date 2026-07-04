/**
 * @file Electron 系统托盘
 * @description 创建托盘图标和右键菜单，支持快速添加事项
 */

import { app, Tray, Menu, BrowserWindow, nativeImage } from 'electron';
import * as path from 'path';
import type { AppWithIsQuitting } from './types';

/**
 * 创建系统托盘
 * @param mainWindow 主窗口引用
 */
export function createTray(mainWindow: BrowserWindow): Tray {
  // 托盘图标：Windows/Linux 上 SVG 经 nativeImage 加载不可靠，必须用 PNG/ICO。
  // dev: public/ 下；prod: electron-builder 把 public/* 当作资源打包到 resourcesPath 根。
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  const iconPath = isDev
    ? path.join(__dirname, '../public/icon-32.png')
    : path.join(process.resourcesPath, 'icon-32.png');

  let icon: Electron.NativeImage;

  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      // 如果图标加载失败，创建一个 16x16 的占位图标
      icon = nativeImage.createEmpty();
    }
  } catch {
    icon = nativeImage.createEmpty();
  }

  // Windows 上需要 resize
  if (process.platform === 'win32' && !icon.isEmpty()) {
    icon = icon.resize({ width: 16, height: 16 });
  }

  const tray = new Tray(icon);
  tray.setToolTip('Celery Todo');

  // 右键菜单
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '快速添加事项',
      accelerator: 'CmdOrCtrl+N',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('quick-add');
      },
    },
    { type: 'separator' },
    {
      label: '显示主窗口',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: '隐藏到托盘',
      click: () => {
        mainWindow.hide();
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        (app as AppWithIsQuitting).isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // 点击托盘图标显示/隐藏窗口
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return tray;
}
