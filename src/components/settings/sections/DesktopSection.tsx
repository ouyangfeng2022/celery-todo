/**
 * @file DesktopSection - 设置页「桌面」子页面
 * @description 开机自启 / 最小化到托盘 / 自动检查更新 + 数据存储位置。
 *              从 SettingsPanel 拆出。仅在 window.electronAPI 存在时由父级路由渲染。
 */

import { useState, useCallback, useEffect } from 'react';
import { FolderIcon } from '../../common/Icons';
import { ConfirmDialog } from '../../common/ConfirmDialog';
import {
  getStorageInfo,
  chooseStorageDirectory,
  changeStorageDirectory,
  resetStorageDirectory,
  openStorageInFolder,
  type StorageInfo,
} from '../../../utils/database';

interface DesktopSectionProps {
  autoStart: boolean;
  minimizeToTray: boolean;
  autoUpdateEnabled: boolean;
  onUpdateSettings: (updates: {
    autoStart?: boolean;
    minimizeToTray?: boolean;
    autoUpdateEnabled?: boolean;
  }) => void;
}

export function DesktopSection({
  autoStart,
  minimizeToTray,
  autoUpdateEnabled,
  onUpdateSettings,
}: DesktopSectionProps) {
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [storageBusy, setStorageBusy] = useState(false);
  const [confirmResetStorage, setConfirmResetStorage] = useState(false);

  // 子页面挂载即加载存储位置信息（本子页面仅在桌面端被渲染）
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const info = await getStorageInfo();
      if (!cancelled) setStorageInfo(info);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isStorageCustomizable = storageInfo?.mode === 'electron';

  // 选择并切换存储目录
  const handleChooseStorageDir = useCallback(async () => {
    try {
      setStorageBusy(true);
      const dir = await chooseStorageDirectory();
      if (!dir) return;
      await changeStorageDirectory(dir);
      setStorageInfo(await getStorageInfo());
    } catch (err) {
      alert(`切换存储位置失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setStorageBusy(false);
    }
  }, []);

  // 重置为默认存储位置
  const handleResetStorage = useCallback(async () => {
    try {
      setStorageBusy(true);
      await resetStorageDirectory();
      setStorageInfo(await getStorageInfo());
    } catch (err) {
      alert(`重置存储位置失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setStorageBusy(false);
    }
  }, []);

  return (
    <div className="space-y-7">
      <section>
        <h3 className="claude-eyebrow mb-3" style={{ color: 'var(--text-secondary)' }}>
          桌面应用
        </h3>
        <label className="flex items-center justify-between py-2 cursor-pointer">
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
            开机自启动
          </span>
          <input
            type="checkbox"
            checked={autoStart}
            onChange={(e) => onUpdateSettings({ autoStart: e.target.checked })}
            className="w-4 h-4 accent-[var(--accent)]"
          />
        </label>
        <label className="flex items-center justify-between py-2 cursor-pointer">
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
            关闭时最小化到托盘
          </span>
          <input
            type="checkbox"
            checked={minimizeToTray}
            onChange={(e) => onUpdateSettings({ minimizeToTray: e.target.checked })}
            className="w-4 h-4 accent-[var(--accent)]"
          />
        </label>
        <label className="flex items-center justify-between py-2 cursor-pointer">
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
            启动时自动检查更新
          </span>
          <input
            type="checkbox"
            checked={autoUpdateEnabled}
            onChange={(e) => onUpdateSettings({ autoUpdateEnabled: e.target.checked })}
            className="w-4 h-4 accent-[var(--accent)]"
          />
        </label>
      </section>

      {isStorageCustomizable && storageInfo && (
        <section>
          <h3 className="claude-eyebrow mb-3" style={{ color: 'var(--text-secondary)' }}>
            数据存储位置
          </h3>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-md mb-2 text-xs"
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
          >
            <FolderIcon size={14} className="flex-shrink-0" />
            <span className="truncate font-mono" title={storageInfo.filePath ?? ''}>
              {storageInfo.filePath}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleChooseStorageDir}
              disabled={storageBusy}
              className="flex items-center justify-center gap-1.5 px-2 py-2 text-xs rounded-md transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
              style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
            >
              <FolderIcon size={14} />
              更改位置
            </button>
            <button
              onClick={() => void openStorageInFolder()}
              disabled={storageBusy}
              className="flex items-center justify-center gap-1.5 px-2 py-2 text-xs rounded-md transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
              style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
            >
              <FolderIcon size={14} />
              打开文件夹
            </button>
            <button
              onClick={() => setConfirmResetStorage(true)}
              disabled={storageBusy}
              className="flex items-center justify-center gap-1.5 px-2 py-2 text-xs rounded-md transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
              style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
            >
              <FolderIcon size={14} />
              重置为默认
            </button>
          </div>
          <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            更改位置时，已有数据会自动迁移到新目录。
          </p>
        </section>
      )}

      <ConfirmDialog
        open={confirmResetStorage}
        title="重置存储位置"
        message="数据将被迁移回应用的默认目录。确定继续吗？"
        confirmText="重置位置"
        onConfirm={() => {
          void handleResetStorage();
          setConfirmResetStorage(false);
        }}
        onCancel={() => setConfirmResetStorage(false)}
      />
    </div>
  );
}
