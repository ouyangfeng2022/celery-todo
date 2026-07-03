/**
 * @file 全局类型声明
 */

/** Electron 预加载脚本暴露的 API */
interface ElectronAPI {
  /** 设置开机自启 */
  setAutoStart: (enabled: boolean) => void;
  /** 获取窗口位置和大小 */
  getWindowBounds: () => Promise<{ x: number; y: number; width: number; height: number }>;
  /** 保存窗口位置和大小 */
  saveWindowBounds: (bounds: { x: number; y: number; width: number; height: number }) => void;
  /** 从托盘快速添加事项 */
  onQuickAdd: (callback: () => void) => void;
  /** 显示托盘通知 */
  showTrayNotification: (title: string, body: string) => void;
  /** 平台信息 */
  platform: string;
}

/** 扩展 Window 接口以包含 electronAPI */
declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
