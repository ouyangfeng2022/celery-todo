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

  /** 监听快速添加事件 */
  onQuickAdd: (callback: () => void): void => {
    ipcRenderer.on('quick-add', () => callback());
  },

  /** 平台信息 */
  platform: process.platform,
};

// 通过 contextBridge 暴露 API
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
