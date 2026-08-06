/**
 * @file ExportProjectDialog - 导出项目对话框
 * @description
 *   在设置页「数据」板块里取代原先的「导出当前项目(CSV)」与「导出当前项目为图片」
 *   两个独立按钮。用户在此选项目 + 格式(JSON / CSV / 图片) 后再执行导出，
 *   不再依赖打开设置页时的「当前活跃项目」。
 */

import { memo, useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Project } from '../../../types';
import { DownloadIcon } from '../../common/Icons';

/** 导出格式：JSON(含归档，可导入) / CSV(仅当前事项) / 图片(PNG 预览) */
export type ExportFormat = 'json' | 'csv' | 'image';

interface ExportProjectDialogProps {
  /** 是否显示 */
  open: boolean;
  /** 全部项目（下拉选项来源） */
  projects: Project[];
  /** 打开时默认选中的项目 id（通常是当前活跃项目） */
  defaultProjectId: string;
  /** 关闭回调 */
  onClose: () => void;
  /** 执行导出：传入所选项目 id 与格式 */
  onExport: (projectId: string, format: ExportFormat) => void;
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: 'json', label: 'JSON', hint: '含归档事项，可重新导入' },
  { value: 'csv', label: 'CSV', hint: '仅当前事项，表格软件可打开' },
  { value: 'image', label: '图片', hint: 'PNG 预览，便于分享' },
];

function ExportProjectDialogComponent({
  open,
  projects,
  defaultProjectId,
  onClose,
  onExport,
}: ExportProjectDialogProps) {
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjectId);
  const [format, setFormat] = useState<ExportFormat>('json');

  // 打开时把选择重置为当前活跃项目，避免上次打开的选择残留
  useEffect(() => {
    if (open) {
      setSelectedProjectId(defaultProjectId || projects[0]?.id || '');
      setFormat('json');
    }
  }, [open, defaultProjectId, projects]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  const canExport = selectedProjectId !== '' && projects.some((p) => p.id === selectedProjectId);

  const handleConfirm = useCallback(() => {
    if (!canExport) return;
    onExport(selectedProjectId, format);
    onClose();
  }, [canExport, selectedProjectId, format, onExport, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* 遮罩 */}
          <div
            className="absolute inset-0 backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(47, 45, 39, 0.4)' }}
            onClick={onClose}
          />

          {/* 对话框 */}
          <motion.div
            className="relative w-full max-w-md rounded-claude p-6"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-lg)',
            }}
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          >
            <div className="flex items-center justify-center gap-2 mb-1.5">
              <div
                className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--accent-subtle, var(--bg-hover))',
                  color: 'var(--accent)',
                }}
              >
                <DownloadIcon size={14} />
              </div>
              <h3
                className="text-lg font-serif font-semibold leading-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                导出项目
              </h3>
            </div>
            <p
              className="text-sm leading-relaxed text-pretty"
              style={{ color: 'var(--text-secondary)' }}
            >
              选择要导出的项目与格式。
            </p>

            {/* 项目下拉 */}
            <label
              className="block mt-4 mb-1 text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              项目
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              disabled={projects.length === 0}
              className="w-full px-3 py-2 text-sm rounded-md outline-none"
              style={{
                color: 'var(--text-primary)',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-strong)',
              }}
            >
              {projects.length === 0 && <option value="">（暂无项目）</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* 格式选择 */}
            <label
              className="block mt-4 mb-1 text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              格式
            </label>
            <div className="space-y-1.5">
              {FORMAT_OPTIONS.map((opt) => {
                const checked = format === opt.value;
                return (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                    style={{
                      backgroundColor: checked ? 'var(--bg-hover)' : 'transparent',
                    }}
                  >
                    <input
                      type="radio"
                      name="export-format"
                      value={opt.value}
                      checked={checked}
                      onChange={() => setFormat(opt.value)}
                      className="accent-[var(--accent)]"
                    />
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      {opt.label}
                    </span>
                    <span className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>
                      {opt.hint}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button className="btn-secondary" onClick={onClose}>
                取消
              </button>
              <button className="btn-primary" onClick={handleConfirm} disabled={!canExport}>
                导出
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const ExportProjectDialog = memo(ExportProjectDialogComponent);
