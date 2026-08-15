/**
 * @file DataSection - 设置页「数据」子页面
 * @description 导出 / 导入 / 重置 + 数据存储位置（仅桌面端渲染）。
 */

import { useState, useCallback, useEffect } from 'react';
import { DownloadIcon, UploadIcon, RefreshIcon, FolderIcon } from '../../common/Icons';
import { ConfirmDialog } from '../../common/ConfirmDialog';
import {
  getStorageInfo,
  chooseStorageDirectory,
  changeStorageDirectory,
  resetStorageDirectory,
  openStorageInFolder,
  type StorageInfo,
} from '../../../utils/storageGateway';

interface DataSectionProps {
  /** 打开统一导出选项卡片 */
  onOpenExport: () => void;
  onImportAll: (file: File) => void;
  onResetData: () => void;
}

export function DataSection({ onOpenExport, onImportAll, onResetData }: DataSectionProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [storageBusy, setStorageBusy] = useState(false);
  const [confirmResetStorage, setConfirmResetStorage] = useState(false);

  const handleImportClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) onImportAll(file);
    };
    input.click();
  }, [onImportAll]);

  // 子页面挂载即加载存储位置信息（仅桌面端会被 isStorageCustomizable 渲染）
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
          数据管理
        </h3>
        <div className="space-y-1.5">
          <button
            onClick={onOpenExport}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)' }}
          >
            <DownloadIcon size={15} />
            导出数据…
          </button>
          <button
            onClick={handleImportClick}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)' }}
          >
            <UploadIcon size={15} />
            导入数据 (JSON)
          </button>
          <button
            onClick={() => setConfirmReset(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors hover:bg-[var(--danger-subtle)]"
            style={{ color: 'var(--danger)', backgroundColor: 'var(--bg-secondary)' }}
          >
            <RefreshIcon size={15} />
            重置所有数据
          </button>
        </div>
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
        open={confirmReset}
        title="重置所有数据"
        message="此操作将永久删除所有项目、事项和设置，且无法恢复。建议先导出备份。确定继续吗？"
        confirmText="永久重置"
        danger
        onConfirm={() => {
          onResetData();
          setConfirmReset(false);
        }}
        onCancel={() => setConfirmReset(false)}
      />

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
