/**
 * @file 自动升级 IPC 模块
 * @description 基于 electron-updater，从 GitHub Releases 检查并安装新版本。
 *              发布源由 package.json 的 build.publish 决定，打包时
 *              electron-builder 会自动生成 app-update.yml 嵌入到资源中。
 *
 *              策略：
 *              - autoDownload = false：发现新版本后等用户在 UI 上确认再下载
 *              - autoInstallOnAppQuit = false：由渲染进程显式触发 quitAndInstall
 *              - 仅在 app.isPackaged 下启用；开发环境直接返回"无更新"
 */

import { app, ipcMain, BrowserWindow } from 'electron';
import { autoUpdater, type UpdateInfo } from 'electron-updater';

// ============================================
// 配置
// ============================================

// 不自动下载，等用户确认
autoUpdater.autoDownload = false;
// 不在退出时自动安装，由 IPC 显式控制
autoUpdater.autoInstallOnAppQuit = false;

// ============================================
// 主窗口引用（由 initUpdater 注入）
// ============================================

let mainWindowRef: BrowserWindow | null = null;

/** 缓存最近一次发现的更新信息（供渲染进程查询版本号/发布说明） */
let cachedUpdateInfo: UpdateInfo | null = null;

// ============================================
// 工具
// ============================================

/** 安全地向渲染进程广播事件：窗口销毁后跳过 */
function send(channel: string, ...args: unknown[]): void {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(channel, ...args);
  }
}

/** 简化 UpdateInfo，仅保留渲染进程需要的字段 */
function pickUpdateInfo(info: UpdateInfo): { version: string; releaseName?: string } {
  return {
    version: info.version,
    // UpdateInfo.releaseName 类型是 string | null | undefined，规范化为可选 string
    releaseName: info.releaseName ?? undefined,
  };
}

// ============================================
// 初始化：绑定 autoUpdater 事件到 IPC 广播
// ============================================

/**
 * 绑定 autoUpdater 事件，转发到渲染进程。
 * 在 app.whenReady 之后、主窗口创建完成时调用一次。
 */
export function initUpdater(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow;

  // 发现新版本
  autoUpdater.on('update-available', (info) => {
    cachedUpdateInfo = info;
    send('updater:update-available', pickUpdateInfo(info));
  });

  // 已是最新版本
  autoUpdater.on('update-not-available', () => {
    cachedUpdateInfo = null;
    send('updater:update-not-available');
  });

  // 下载进度
  autoUpdater.on('download-progress', (progress) => {
    send('updater:download-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  // 下载完成
  autoUpdater.on('update-downloaded', () => {
    send('updater:update-downloaded');
  });

  // 错误
  autoUpdater.on('error', (err) => {
    send('updater:error', err?.message ?? '升级失败');
  });
}

// ============================================
// IPC 通道注册
// ============================================

export function registerUpdaterIpc(): void {
  /** 检查更新（开发环境下短路，直接视为"无更新"） */
  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) {
      // 开发环境：electron-updater 无法工作，通知渲染进程"已是最新"
      send('updater:update-not-available');
      return;
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      send('updater:error', err instanceof Error ? err.message : '检查更新失败');
    }
  });

  /** 下载更新 */
  ipcMain.handle('updater:download', async () => {
    if (!app.isPackaged) return;
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      send('updater:error', err instanceof Error ? err.message : '下载更新失败');
    }
  });

  /** 退出并安装 */
  ipcMain.handle('updater:quit-and-install', () => {
    if (!app.isPackaged) return;
    autoUpdater.quitAndInstall();
  });

  /** 获取当前应用版本 */
  ipcMain.handle('updater:get-current-version', () => {
    return app.getVersion();
  });

  /** 获取最近一次发现的更新信息（可空） */
  ipcMain.handle('updater:get-cached-info', () => {
    return cachedUpdateInfo ? pickUpdateInfo(cachedUpdateInfo) : null;
  });
}
