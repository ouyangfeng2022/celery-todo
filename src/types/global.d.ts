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
  /** 更新标题栏 overlay 颜色（与主题同步，仅 Win/Linux） */
  setTitleBarOverlay: (options: { color: string; symbolColor: string }) => Promise<void>;
  /** 平台信息 */
  platform: string;
  /** 获取当前数据存储配置 */
  storageGetConfig: () => Promise<{ filePath: string; defaultDir: string }>;
  /** 从当前存储路径读取数据库二进制 */
  storageLoad: () => Promise<Uint8Array | null>;
  /** 写入数据库二进制到当前存储路径 */
  storageSave: (data: Uint8Array) => Promise<void>;
  /** 弹出文件夹选择对话框 */
  storageChooseDirectory: () => Promise<string | null>;
  /** 切换存储目录并迁移数据 */
  storageSetPath: (newDir: string) => Promise<{ filePath: string }>;
  /** 在系统资源管理器中显示数据库文件 */
  storageOpenInFolder: () => Promise<void>;
  /** 重置到默认存储位置 */
  storageResetToDefault: () => Promise<{ filePath: string }>;
}

/** 扩展 Window 接口以包含 electronAPI */
declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
