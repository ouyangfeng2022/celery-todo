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

  /** 监听快速添加事件，返回取消订阅函数 */
  onQuickAdd: (callback: () => void): (() => void) => {
    const listener = (): void => callback();
    ipcRenderer.on('quick-add', listener);
    return () => {
      ipcRenderer.removeListener('quick-add', listener);
    };
  },
  /** 创建一张桌面贴图；projectId 为空时由贴图自行选择第一个项目 */
  createSticker: (projectId?: string): Promise<void> => ipcRenderer.invoke('sticker:create', projectId),
  setStickerProject: (id: string, projectId: string): Promise<void> =>
    ipcRenderer.invoke('sticker:set-project', id, projectId),
  closeSticker: (id: string): Promise<void> => ipcRenderer.invoke('sticker:close', id),
  /** 通知所有已打开的贴图窗口：样式设置已变更，需重新读取并应用 */
  notifyStickerStyleChanged: (): Promise<void> => ipcRenderer.invoke('sticker:style-changed'),
  /** 监听主进程广播的"贴图样式已变更"事件（仅在贴图 renderer 内使用），返回取消订阅函数 */
  onStickerStyleChanged: (callback: () => void): (() => void) => {
    const listener = (): void => callback();
    ipcRenderer.on('sticker:style-changed', listener);
    return () => {
      ipcRenderer.removeListener('sticker:style-changed', listener);
    };
  },
  /** 数据已落盘，请求其它窗口重新加载内存库（database.persistDatabase 自动调用） */
  notifyDataChanged: (): Promise<void> => ipcRenderer.invoke('data:changed'),
  /** 监听"其它窗口修改了数据库"广播，收到后需重读内存库并刷新视图，返回取消订阅函数 */
  onDataChanged: (callback: () => void): (() => void) => {
    const listener = (): void => callback();
    ipcRenderer.on('data:changed', listener);
    return () => {
      ipcRenderer.removeListener('data:changed', listener);
    };
  },

  /**
   * 监听安装阶段勾选了"开机自启"事件（一次性）。
   * 触发时机：主进程在 NSIS 安装时已通过 app.setLoginItemSettings 写好注册表，
   * 渲染进程加载完成后主进程会推送此事件，让 store 把 settings.autoStart
   * 同步进 DB，保持设置面板 UI 与系统状态一致。
   * 返回取消订阅函数。
   */
  onInstallOptionsAutoStart: (callback: (enabled: boolean) => void): (() => void) => {
    const listener = (_event: unknown, enabled: boolean): void => callback(enabled);
    ipcRenderer.on('install-options:auto-start', listener);
    return () => {
      ipcRenderer.removeListener('install-options:auto-start', listener);
    };
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

  // ===== CLI IPC 桥接 =====

  /**
   * 监听来自 CLI 的请求（经主进程转发）。handler 在渲染进程上下文执行，
   * 处理完后必须调用 cliRespond(id, result) 把结果回传给主进程，最终回到 CLI。
   * 请求体：{ id: string; method: string; params?: unknown }
   * 返回取消订阅函数。
   */
  onCliRequest: (
    callback: (req: { id: string; method: string; params?: unknown }) => void,
  ): (() => void) => {
    const listener = (_event: unknown, req: { id: string; method: string; params?: unknown }): void =>
      callback(req);
    ipcRenderer.on('cli:request', listener);
    return () => {
      ipcRenderer.removeListener('cli:request', listener);
    };
  },

  /**
   * 把 CLI 请求的处理结果回传给主进程。无论成功或失败都要回包，
   * 否则主进程的待决 Promise 会一直挂起直到超时。
   * payload: { id: string; result?: unknown; error?: { message: string } }
   */
  cliRespond: (payload: { id: string; result?: unknown; error?: { message: string } }): Promise<void> =>
    ipcRenderer.invoke('cli:response', payload),

  // ===== 自动升级 =====

  /** 检查更新（开发环境下会直接视为"无更新"） */
  updaterCheck: (): Promise<void> => ipcRenderer.invoke('updater:check'),

  /** 下载已发现的更新 */
  updaterDownload: (): Promise<void> => ipcRenderer.invoke('updater:download'),

  /** 退出应用并安装已下载的更新 */
  updaterQuitAndInstall: (): Promise<void> => ipcRenderer.invoke('updater:quit-and-install'),

  /** 获取当前应用版本号 */
  updaterGetCurrentVersion: (): Promise<string> => ipcRenderer.invoke('updater:get-current-version'),

  /** 获取最近一次发现的更新信息（可空） */
  updaterGetCachedInfo: (): Promise<{ version: string; releaseName?: string } | null> =>
    ipcRenderer.invoke('updater:get-cached-info'),

  /** 监听"发现新版本"事件，返回取消订阅函数 */
  onUpdateAvailable: (
    callback: (info: { version: string; releaseName?: string }) => void,
  ): (() => void) => {
    const listener = (_event: unknown, info: { version: string; releaseName?: string }): void =>
      callback(info);
    ipcRenderer.on('updater:update-available', listener);
    return () => {
      ipcRenderer.removeListener('updater:update-available', listener);
    };
  },

  /** 监听"已是最新版本"事件，返回取消订阅函数 */
  onUpdateNotAvailable: (callback: () => void): (() => void) => {
    const listener = (): void => callback();
    ipcRenderer.on('updater:update-not-available', listener);
    return () => {
      ipcRenderer.removeListener('updater:update-not-available', listener);
    };
  },

  /** 监听下载进度，返回取消订阅函数 */
  onDownloadProgress: (
    callback: (progress: { percent: number; transferred: number; total: number }) => void,
  ): (() => void) => {
    const listener = (
      _event: unknown,
      progress: { percent: number; transferred: number; total: number },
    ): void => callback(progress);
    ipcRenderer.on('updater:download-progress', listener);
    return () => {
      ipcRenderer.removeListener('updater:download-progress', listener);
    };
  },

  /** 监听"更新下载完成"事件，返回取消订阅函数 */
  onUpdateDownloaded: (callback: () => void): (() => void) => {
    const listener = (): void => callback();
    ipcRenderer.on('updater:update-downloaded', listener);
    return () => {
      ipcRenderer.removeListener('updater:update-downloaded', listener);
    };
  },

  /** 监听升级错误，返回取消订阅函数 */
  onUpdaterError: (callback: (message: string) => void): (() => void) => {
    const listener = (_event: unknown, message: string): void => callback(message);
    ipcRenderer.on('updater:error', listener);
    return () => {
      ipcRenderer.removeListener('updater:error', listener);
    };
  },
};

// 通过 contextBridge 暴露 API
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
