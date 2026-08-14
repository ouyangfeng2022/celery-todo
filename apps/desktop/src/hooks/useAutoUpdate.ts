/**
 * @file useAutoUpdate - 自动升级 Hook（3.0 阶段 A 桩）
 * @description 2.x 经 electron-updater 的状态机；3.0 将在阶段 B（平台能力）
 *              换成 tauri-plugin-updater。当前 isDesktop 恒为 false，
 *              所有 UI 更新入口（侧边栏卡片 / 设置页「关于」）据此隐藏，
 *              函数签名与 2.x 完全一致，届时只换实现不动调用方。
 */

import { useCallback, useState } from 'react';
import { capabilities } from '../platform';

/** 升级状态 */
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'dismissed'
  | 'error';

/** 更新信息（简化版） */
export interface UpdateInfoLite {
  version: string;
  releaseName?: string;
}

/** 下载进度 */
export interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
}

export interface UseAutoUpdateOptions {
  /** 数据库已就绪（用于触发启动后的首次自动检查） */
  dbReady: boolean;
}

export function useAutoUpdate(_options: UseAutoUpdateOptions) {
  const [status] = useState<UpdateStatus>('idle');
  const [updateInfo] = useState<UpdateInfoLite | null>(null);
  const [progress] = useState<DownloadProgress | null>(null);
  const [errorMsg] = useState<string>('');
  const [isNewlyAvailable] = useState<boolean>(false);
  const [sidebarDismissed, setSidebarDismissed] = useState<boolean>(false);

  const isDesktop = capabilities.updater;

  const checkForUpdates = useCallback(() => {}, []);
  const downloadUpdate = useCallback(() => {}, []);
  const quitAndInstall = useCallback(() => {}, []);
  const dismissDownloaded = useCallback(() => {}, []);
  const acknowledgeUpdate = useCallback(() => {}, []);
  const dismissSidebarUpdate = useCallback(() => setSidebarDismissed(true), []);

  return {
    isDesktop,
    status,
    updateInfo,
    progress,
    errorMsg,
    isNewlyAvailable,
    sidebarDismissed,
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
    dismissDownloaded,
    acknowledgeUpdate,
    dismissSidebarUpdate,
  };
}
