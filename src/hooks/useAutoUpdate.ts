/**
 * @file useAutoUpdate - 自动升级 Hook
 * @description 集中管理渲染进程的升级状态机：
 *              - 订阅主进程的升级事件
 *              - 启动时按设置自动检查（仅桌面端）
 *              - 暴露 actions 供设置面板 / 全局对话框调用
 *
 *              状态迁移：
 *              idle → checking → available → downloading → downloaded → dismissed
 *                           └→ not-available (idle)
 *              任意阶段 → error
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';
import * as db from '../utils/database';

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

/** 主进程推送的更新信息（简化版） */
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

export function useAutoUpdate({ dbReady }: UseAutoUpdateOptions) {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfoLite | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  // 当前 available 版本是否尚未被用户「查看过」（即尚未写盘到 NOTIFIED_VERSION_KEY）。
  // 为 true 时 Header 徽标会高亮提示；用户打开设置面板或点击徽标后通过 acknowledgeUpdate 置 false。
  const [isNewlyAvailable, setIsNewlyAvailable] = useState<boolean>(false);

  const autoUpdateEnabled = useSettingsStore((s) => s.autoUpdateEnabled);

  /** 持久化键：记录最近一次「主动提示过」的更新版本号，避免同一版本每次启动都弹提示 */
  const NOTIFIED_VERSION_KEY = 'updateNotifiedVersion';

  // 防止启动时重复检查（StrictMode 双重渲染 + 多次 dbReady 变化）
  const autoCheckedRef = useRef(false);
  // 是否在桌面端
  const isDesktop = typeof window !== 'undefined' && !!window.electronAPI?.updaterCheck;

  // ===== 订阅主进程事件 =====
  useEffect(() => {
    if (!isDesktop) return;
    const api = window.electronAPI!;
    if (!api.onUpdateAvailable) return;

    const offAvailable = api.onUpdateAvailable((info) => {
      setUpdateInfo(info);
      setStatus('available');
      setErrorMsg('');
      // 同一版本只在首次发现时标记为「新提示」并写盘，避免每次启动重复打扰
      const alreadyNotified = db.getSetting(NOTIFIED_VERSION_KEY) === info.version;
      setIsNewlyAvailable(!alreadyNotified);
      if (!alreadyNotified) {
        db.setSetting(NOTIFIED_VERSION_KEY, info.version);
      }
    });
    const offNotAvailable = api.onUpdateNotAvailable(() => {
      setStatus('not-available');
      setUpdateInfo(null);
      setProgress(null);
    });
    const offProgress = api.onDownloadProgress((p) => {
      setProgress(p);
      setStatus('downloading');
    });
    const offDownloaded = api.onUpdateDownloaded(() => {
      setStatus('downloaded');
      setProgress(null);
    });
    const offError = api.onUpdaterError((message) => {
      setErrorMsg(message);
      setStatus('error');
    });

    // ipcRenderer.on 没有返回 unsubscribe，这里通过 listener 移除手段不可用；
    // 由于本 hook 在 App 顶层只挂载一次，生命周期与窗口一致，不卸载也可以接受。
    // 但为减少 StrictMode 双挂载的影响，仍提供清理逻辑（见下方说明）。
    return () => {
      // electron 的 ipcRenderer.on 不能在渲染端精确 remove（除非把 listener 传进去），
      // 当前 preload 没有暴露 remove 接口，这里不做主动清理。
      // 多次挂载会叠加 listener，但 StrictMode 仅在开发模式下双挂载，影响有限。
      void offAvailable;
      void offNotAvailable;
      void offProgress;
      void offDownloaded;
      void offError;
    };
  }, [isDesktop]);

  // ===== 启动后自动检查一次 =====
  useEffect(() => {
    if (!isDesktop) return;
    if (!dbReady) return;
    if (!autoUpdateEnabled) return;
    if (autoCheckedRef.current) return;
    autoCheckedRef.current = true;
    setStatus('checking');
    void window.electronAPI!.updaterCheck();
  }, [isDesktop, dbReady, autoUpdateEnabled]);

  // ===== Actions =====

  /** 手动触发检查 */
  const checkForUpdates = useCallback(() => {
    if (!isDesktop) return;
    setStatus('checking');
    setErrorMsg('');
    setUpdateInfo(null);
    setProgress(null);
    void window.electronAPI!.updaterCheck();
  }, [isDesktop]);

  /** 开始下载（要求当前处于 available 状态） */
  const downloadUpdate = useCallback(() => {
    if (!isDesktop) return;
    setStatus('downloading');
    setErrorMsg('');
    void window.electronAPI!.updaterDownload();
  }, [isDesktop]);

  /** 退出并安装：先把数据库刷盘，避免数据丢失 */
  const quitAndInstall = useCallback(async () => {
    if (!isDesktop) return;
    await db.flushSave();
    window.electronAPI!.updaterQuitAndInstall();
  }, [isDesktop]);

  /** 用户在"更新已就绪"对话框点击"稍后"：关闭全局弹窗，保留更新包供后续重启 */
  const dismissDownloaded = useCallback(() => {
    setStatus('dismissed');
  }, []);

  /**
   * 用户已查看本次更新提示（点击徽标或打开设置面板）。
   * 仅清掉「新提示」高亮，status 仍保持 available，更新区在设置面板里依旧可见。
   */
  const acknowledgeUpdate = useCallback(() => {
    setIsNewlyAvailable(false);
    if (updateInfo) {
      db.setSetting(NOTIFIED_VERSION_KEY, updateInfo.version);
    }
  }, [updateInfo]);

  return {
    isDesktop,
    status,
    updateInfo,
    progress,
    errorMsg,
    isNewlyAvailable,
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
    dismissDownloaded,
    acknowledgeUpdate,
  };
}
