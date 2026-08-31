/**
 * @file useAutoUpdate - 自动升级 Hook（tauri-plugin-updater）
 * @description 集中管理升级状态机：
 *              - checkForUpdates/downloadUpdate 经 tauri-plugin-updater
 *                （端点/公钥在 tauri.conf plugins.updater）
 *              - quitAndInstall 经 tauri-plugin-process 重启
 *              - 启动时按设置自动检查（仅桌面端）
 *
 *              状态迁移：
 *              idle → checking → available → downloading → downloaded → dismissed
 *                           └→ not-available (idle)
 *              任意阶段 → error
 *
 *              与 2.x electron-updater 版签名一致（App / SettingsPanel /
 *              ProjectSidebar 侧边栏卡片共用）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';
import * as data from '../utils/dataGateway';
import { capabilities, isTauri } from '../platform';

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

/**
 * 把更新器底层错误翻译为用户可读文案。
 * reqwest 网络层失败统一表现为 "error sending request for url …"（DNS 失败 /
 * 连接超时等），常见于未走代理直连 GitHub 被阻断——原样展示毫无信息量。
 */
function describeUpdateError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (
    /error sending request|error trying to connect|dns error|timed out|connection (refused|closed)/i.test(
      raw,
    )
  ) {
    return '无法连接更新服务器（GitHub），请检查网络或代理后重试';
  }
  return raw;
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
  const isDesktop = isTauri && capabilities.updater;

  const checkForUpdates = useCallback(async (): Promise<void> => {
    if (!isDesktop) return;
    setStatus('checking');
    setErrorMsg('');
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update?.available) {
        lastSeenVersionRef.current = update.currentVersion;
        setUpdateInfo({
          version: update.version,
          releaseName: update.currentVersion,
        });
        setStatus('available');
        // 同一版本只在首次发现时标记「新可用」
        void data.getSetting(NOTIFIED_VERSION_KEY).then((notified) => {
          if (notified !== update.version) {
            setIsNewlyAvailable(true);
            void data.setSetting(NOTIFIED_VERSION_KEY, update.version);
          }
        });
      } else {
        setStatus('not-available');
      }
    } catch (e) {
      setErrorMsg(describeUpdateError(e));
      setStatus('error');
    }
  }, [isDesktop]);

  const downloadUpdate = useCallback(async (): Promise<void> => {
    if (!isDesktop) return;
    setStatus('downloading');
    setErrorMsg('');
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update?.available) {
        setStatus('not-available');
        return;
      }
      let total = 0;
      let transferred = 0;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            total = event.data.contentLength ?? 0;
            break;
          case 'Progress':
            transferred += event.data.chunkLength;
            setProgress({
              percent: total > 0 ? (transferred / total) * 100 : 0,
              transferred,
              total,
            });
            break;
          case 'Finished':
            setProgress({ percent: 100, transferred, total });
            break;
        }
      });
      setStatus('downloaded');
    } catch (e) {
      setErrorMsg(describeUpdateError(e));
      setStatus('error');
    }
  }, [isDesktop]);

  const quitAndInstall = useCallback(async (): Promise<void> => {
    if (!isDesktop) return;
    try {
      // downloadAndInstall 默认装完即重启；此处显式重启兜底「只下载」路径
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }, [isDesktop]);

  const dismissDownloaded = useCallback(() => setStatus('dismissed'), []);

  const acknowledgeUpdate = useCallback(() => setIsNewlyAvailable(false), []);

  const dismissSidebarUpdate = useCallback(() => setSidebarDismissed(true), []);

  // 启动自动检查：dbReady 后按设置执行一次
  useEffect(() => {
    if (!isDesktop || !dbReady || autoCheckedRef.current) return;
    autoCheckedRef.current = true;
    if (autoUpdateEnabled) void checkForUpdates();
  }, [autoUpdateEnabled, checkForUpdates, dbReady, isDesktop]);

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
