/**
 * @file ExportDialog - 统一导出选项卡片
 * @description 所有导出入口都先到这里，再由用户选择范围和格式。
 */

import { AnimatePresence, motion } from 'framer-motion';
import { memo, useCallback, useEffect, useState } from 'react';
import type { Project } from '@/types';
import { DownloadIcon } from '../common/Icons';

export type ExportScope = 'project' | 'all';
export type ExportFormat = 'json' | 'excel' | 'image';

export interface ExportRequest {
  scope: ExportScope;
  projectId: string;
  format: ExportFormat;
}

interface ExportDialogProps {
  open: boolean;
  projects: Project[];
  defaultScope?: ExportScope;
  defaultProjectId: string;
  onClose: () => void;
  onPreview: (request: ExportRequest) => void;
  onExport: (request: ExportRequest) => void;
}

const FORMAT_OPTIONS: Array<{ value: ExportFormat; label: string; hint: string }> = [
  { value: 'json', label: 'JSON 备份', hint: '保留项目、事项和归档，可重新导入' },
  { value: 'excel', label: 'Excel 工作簿', hint: '以 .xlsx 文件导出，适合表格软件' },
  { value: 'image', label: 'PNG 图片', hint: '生成项目清单预览，便于分享' },
];

function ExportDialogComponent({
  open,
  projects,
  defaultScope = 'project',
  defaultProjectId,
  onClose,
  onPreview,
  onExport,
}: ExportDialogProps) {
  const [scope, setScope] = useState<ExportScope>(defaultScope);
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [format, setFormat] = useState<ExportFormat>('json');

  useEffect(() => {
    if (open) {
      setScope(defaultScope);
      setProjectId(defaultProjectId || projects[0]?.id || '');
      setFormat('json');
    }
  }, [defaultProjectId, defaultScope, open, projects]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, open]);

  const isProjectExport = scope === 'project';
  const canExport = !isProjectExport || projects.some((project) => project.id === projectId);

  const handleScopeChange = (nextScope: ExportScope) => {
    setScope(nextScope);
  };

  const request = (): ExportRequest => ({ scope, projectId, format });

  const handlePreview = () => {
    if (!canExport) return;
    onPreview(request());
  };

  const handleExport = () => {
    if (!canExport) return;
    onExport(request());
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-dialog-title"
        >
          <div
            className="absolute inset-0 backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(47, 45, 39, 0.4)' }}
            onClick={onClose}
          />
          <motion.div
            className="relative w-full max-w-xl overflow-hidden rounded-claude border"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              borderColor: 'var(--border-color)',
              boxShadow: 'var(--shadow-lg)',
            }}
            initial={{ scale: 0.97, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          >
            <div className="border-b px-6 py-5" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                  style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent)' }}
                >
                  <DownloadIcon size={16} />
                </span>
                <div>
                  <h3
                    id="export-dialog-title"
                    className="font-serif text-lg font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    导出
                  </h3>
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    先确定导出内容，再选择最合适的文件格式。
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-5 px-6 py-5">
              <section>
                <p className="mb-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  导出范围
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['project', '单个项目', '选择一个项目及其事项'],
                      ['all', '全部项目', '创建完整应用备份'],
                    ] as const
                  ).map(([value, label, hint]) => {
                    const selected = scope === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleScopeChange(value)}
                        className="rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                        style={{
                          borderColor: selected ? 'var(--accent)' : 'var(--border-color)',
                          backgroundColor: selected
                            ? 'var(--accent-subtle)'
                            : 'var(--bg-secondary)',
                        }}
                      >
                        <span
                          className="block text-sm font-medium"
                          style={{ color: selected ? 'var(--accent)' : 'var(--text-primary)' }}
                        >
                          {label}
                        </span>
                        <span
                          className="mt-0.5 block text-xs"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          {hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {isProjectExport && (
                <section>
                  <label
                    className="mb-2 block text-xs font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    项目
                  </label>
                  <select
                    value={projectId}
                    onChange={(event) => setProjectId(event.target.value)}
                    disabled={projects.length === 0}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                    style={{
                      color: 'var(--text-primary)',
                      backgroundColor: 'var(--bg-secondary)',
                      borderColor: 'var(--border-strong)',
                    }}
                  >
                    {projects.length === 0 && <option value="">（暂无项目）</option>}
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </section>
              )}

              <section>
                <p className="mb-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  文件格式
                </p>
                <div className="space-y-1.5">
                  {FORMAT_OPTIONS.map((option) => {
                    const unavailable = !isProjectExport && option.value === 'image';
                    const selected = format === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={unavailable}
                        onClick={() => setFormat(option.value)}
                        className="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors enabled:hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-45"
                        style={{
                          borderColor: selected ? 'var(--accent)' : 'transparent',
                          backgroundColor: selected
                            ? 'var(--accent-subtle)'
                            : 'var(--bg-secondary)',
                        }}
                      >
                        <span
                          className="flex h-4 w-4 items-center justify-center rounded-full border"
                          style={{
                            borderColor: selected ? 'var(--accent)' : 'var(--border-strong)',
                          }}
                        >
                          {selected && (
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: 'var(--accent)' }}
                            />
                          )}
                        </span>
                        <span className="flex-1">
                          <span
                            className="block text-sm font-medium"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {option.label}
                          </span>
                          <span className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            {unavailable ? '图片仅支持导出单个项目' : option.hint}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            <div
              className="flex justify-end gap-2 border-t px-6 py-4"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <button className="btn-secondary" onClick={onClose}>
                取消
              </button>
              <button className="btn-secondary" onClick={handlePreview} disabled={!canExport}>
                预览
              </button>
              <button className="btn-primary" onClick={handleExport} disabled={!canExport}>
                导出
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const ExportDialog = memo(ExportDialogComponent);
