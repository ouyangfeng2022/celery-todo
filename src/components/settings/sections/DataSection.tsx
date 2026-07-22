/**
 * @file DataSection - 设置页「数据」子页面
 * @description 导出全部/导出当前/导入/重置。从 SettingsPanel 拆出。
 */

import { useState, useCallback } from 'react';
import { DownloadIcon, UploadIcon, RefreshIcon } from '../../common/Icons';
import { ConfirmDialog } from '../../common/ConfirmDialog';

interface DataSectionProps {
  onExportAll: () => void;
  onExportCsv: () => void;
  onImportAll: (file: File) => void;
  onResetData: () => void;
}

export function DataSection({
  onExportAll,
  onExportCsv,
  onImportAll,
  onResetData,
}: DataSectionProps) {
  const [confirmReset, setConfirmReset] = useState(false);

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

  return (
    <>
      <section>
        <h3 className="claude-eyebrow mb-3" style={{ color: 'var(--text-secondary)' }}>
          数据管理
        </h3>
        <div className="space-y-1.5">
          <button
            onClick={onExportAll}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)' }}
          >
            <DownloadIcon size={15} />
            导出全部数据 (JSON)
          </button>
          <button
            onClick={onExportCsv}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)' }}
          >
            <DownloadIcon size={15} />
            导出当前项目 (CSV)
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
    </>
  );
}
