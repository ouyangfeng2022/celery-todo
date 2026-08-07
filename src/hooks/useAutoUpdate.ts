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
import * as data from '../utils/dataGateway';

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
  // 用户是否已手动关闭侧边栏更新卡片。仅影响侧边栏卡片显隐——
  // 设置面板「关于」里的更新状态仍完整可见，不会丢失信息。
  // 发现新版本（version 变化）时自动复位，保证下次启动新版本仍可提醒。
  const [sidebarDismissed, setSidebarDismissed] = useState<boolean>(false);

  const autoUpdateEnabled = useSettingsStore((s) => s.autoUpdateEnabled);

  /** 持久化键：记录最近一次「主动提示过」的更新版本号，避免同一版本每次启动都弹提示 */
  const NOTIFIED_VERSION_KEY = 'updateNotifiedVersion';

  // 防止启动时重复检查（StrictMode 双重渲染 + 多次 dbReady 变化）
  const autoCheckedRef = useRef(false);
  // 最近一次见到的 available 版本号（在事件回调里读最新值，规避闭包陈旧问题）。
  const lastSeenVersionRef = useRef<string | null>(null);
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
      // 版本变化时复位侧边栏卡片的「已关闭」标记，让新版本重新可见。
      if (info.version !== lastSeenVersionRef.current) {
        setSidebarDismissed(false);
      }
      lastSeenVersionRef.current = info.version;
      // 同一版本只在首次发现时标记为「新提示」并写盘，避免每次启动重复打扰
      void data.getSetting(NOTIFIED_VERSION_KEY).then((storedVersion) => {
        const alreadyNotified = storedVersion === info.version;
        setIsNewlyAvailable(!alreadyNotified);
        if (!alreadyNotified) void data.setSetting(NOTIFIED_VERSION_KEY, info.version);
      });
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

    // preload 的 onXxx 现已返回 unsubscribe 函数，在 cleanup 里逐个调用，
    // 避免监听器泄漏（StrictMode 双挂载 / 未来动态挂载都会叠加 listener）。
    return () => {
      offAvailable();
      offNotAvailable();
      offProgress();
      offDownloaded();
      offError();
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
    await data.flush();
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
      void data.setSetting(NOTIFIED_VERSION_KEY, updateInfo.version);
    }
  }, [updateInfo]);

  /**
   * 用户点击侧边栏卡片右上角叉号关闭卡片。
   * 仅隐藏侧边栏卡片，不影响 status / 设置面板内的更新状态。
   * 出现新版本（version 变化）时自动复位。
   */
  const dismissSidebarUpdate = useCallback(() => {
    setSidebarDismissed(true);
  }, []);

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
