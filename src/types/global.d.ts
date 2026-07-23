/**
 * @file 全局类型声明
 */

/** Electron 预加载脚本暴露的 API */
interface ElectronAPI {
  /** 设置开机自启 */
  setAutoStart: (enabled: boolean) => Promise<void>;
  /** 获取窗口位置和大小 */
  getWindowBounds: () => Promise<{ x: number; y: number; width: number; height: number }>;
  /** 保存窗口位置和大小 */
  saveWindowBounds: (bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => Promise<void>;
  /** 从托盘快速添加事项 */
  onQuickAdd: (callback: () => void) => void;
  createSticker: (projectId?: string) => Promise<void>;
  setStickerProject: (id: string, projectId: string) => Promise<void>;
  closeSticker: (id: string) => Promise<void>;
  /** 通知所有已打开的贴图窗口：样式设置已变更（主窗口侧调用） */
  notifyStickerStyleChanged: () => Promise<void>;
  /** 监听"贴图样式已变更"广播（贴图 renderer 侧调用） */
  onStickerStyleChanged: (callback: () => void) => void;
  /** 数据已落盘，请求其它窗口重新加载内存库（database.persistDatabase 自动调用） */
  notifyDataChanged: () => Promise<void>;
  /** 监听"其它窗口修改了数据库"广播，收到后需重读内存库并刷新视图 */
  onDataChanged: (callback: () => void) => void;
  /** 监听安装阶段勾选了"开机自启"事件（一次性同步用） */
  onInstallOptionsAutoStart: (callback: (enabled: boolean) => void) => void;
  /** 显示托盘通知 */
  showTrayNotification: (title: string, body: string) => Promise<void>;
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
  // ===== CLI IPC 桥接 =====
  /** 监听来自 CLI 的请求（主进程转发） */
  onCliRequest: (callback: (req: { id: string; method: string; params?: unknown }) => void) => void;
  /** 把 CLI 请求的处理结果回传给主进程 */
  cliRespond: (payload: {
    id: string;
    result?: unknown;
    error?: { message: string };
  }) => Promise<void>;
  // ===== 自动升级 =====
  /** 检查更新（开发环境直接视为"无更新"） */
  updaterCheck: () => Promise<void>;
  /** 下载已发现的更新 */
  updaterDownload: () => Promise<void>;
  /** 退出应用并安装已下载的更新 */
  updaterQuitAndInstall: () => Promise<void>;
  /** 获取当前应用版本号 */
  updaterGetCurrentVersion: () => Promise<string>;
  /** 获取最近一次发现的更新信息（可空） */
  updaterGetCachedInfo: () => Promise<{ version: string; releaseName?: string } | null>;
  /** 监听"发现新版本"事件 */
  onUpdateAvailable: (callback: (info: { version: string; releaseName?: string }) => void) => void;
  /** 监听"已是最新版本"事件 */
  onUpdateNotAvailable: (callback: () => void) => void;
  /** 监听下载进度 */
  onDownloadProgress: (
    callback: (progress: { percent: number; transferred: number; total: number }) => void,
  ) => void;
  /** 监听"更新下载完成"事件 */
  onUpdateDownloaded: (callback: () => void) => void;
  /** 监听升级错误 */
  onUpdaterError: (callback: (message: string) => void) => void;
}

/** 扩展 Window 接口以包含 electronAPI */
declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
