/**
 * @file Electron 预加载脚本
 * @description 通过 contextBridge 安全地暴露 API 给渲染进程
 */

import { contextBridge, ipcRenderer } from 'electron';

// 暴露给渲染进程的 API
const electronAPI = {
  /** 设置开机自启 */
  setAutoStart: (enabled: boolean): Promise<void> => ipcRenderer.invoke('set-auto-start', enabled),

  /** 获取窗口位置和大小 */
  getWindowBounds: (): Promise<{ x: number; y: number; width: number; height: number }> =>
    ipcRenderer.invoke('get-window-bounds'),

  /** 保存窗口位置和大小 */
  saveWindowBounds: (bounds: { x: number; y: number; width: number; height: number }): Promise<void> =>
    ipcRenderer.invoke('save-window-bounds', bounds),

  /** 显示托盘通知 */
  showTrayNotification: (title: string, body: string): Promise<void> =>
    ipcRenderer.invoke('show-tray-notification', title, body),

  /** 更新标题栏 overlay 颜色（与主题同步，仅 Win/Linux） */
  setTitleBarOverlay: (options: { color: string; symbolColor: string }): Promise<void> =>
    ipcRenderer.invoke('set-titlebar-overlay', options),

  /** 监听快速添加事件 */
  onQuickAdd: (callback: () => void): void => {
    ipcRenderer.on('quick-add', () => callback());
  },

  /** 平台信息 */
  platform: process.platform,

  // ===== 数据存储位置 =====

  /** 获取当前数据存储配置（文件路径 + 默认目录） */
  storageGetConfig: (): Promise<{ filePath: string; defaultDir: string }> =>
    ipcRenderer.invoke('storage:get-config'),

  /** 从当前存储路径读取数据库二进制 */
  storageLoad: (): Promise<Uint8Array | null> => ipcRenderer.invoke('storage:load'),

  /** 写入数据库二进制到当前存储路径 */
  storageSave: (data: Uint8Array): Promise<void> => ipcRenderer.invoke('storage:save', data),

  /** 弹出文件夹选择对话框，返回所选目录路径或 null */
  storageChooseDirectory: (): Promise<string | null> => ipcRenderer.invoke('storage:choose-directory'),

  /** 切换存储目录并迁移已有数据 */
  storageSetPath: (newDir: string): Promise<{ filePath: string }> =>
    ipcRenderer.invoke('storage:set-path', newDir),

  /** 在系统资源管理器中显示数据库文件 */
  storageOpenInFolder: (): Promise<void> => ipcRenderer.invoke('storage:open-in-folder'),

  /** 重置到默认存储位置（同时迁移数据） */
  storageResetToDefault: (): Promise<{ filePath: string }> => ipcRenderer.invoke('storage:reset-to-default'),
};

// 通过 contextBridge 暴露 API
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
