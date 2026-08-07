/**
 * @file ExportDataPreviewDialog - JSON 与 Excel 的真实导出预览
 * @description 选项确认后进入此页，以代码或表格的形态呈现即将导出的数据摘要。
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo } from 'react';
import type { Project, Todo } from '@/types';
import type { ExportFormat, ExportScope } from './ExportDialog';

interface ExportDataPreviewDialogProps {
  open: boolean;
  scope: ExportScope;
  format: Exclude<ExportFormat, 'image'>;
  projects: Project[];
  projectTodos: Record<string, Todo[]>;
  jsonPreview: string;
  onClose: () => void;
  onDownload: () => void;
}

const PREVIEW_ROW_COUNT = 8;
const PREVIEW_SHEET_COUNT = 3;
const JSON_PREVIEW_LINE_COUNT = 36;

function priorityLabel(priority: Todo['priority']): string {
  return priority === 'high' ? '高' : priority === 'medium' ? '中' : '低';
}

export function ExportDataPreviewDialog({
  open,
  scope,
  format,
  projects,
  projectTodos,
  jsonPreview,
  onClose,
  onDownload,
}: ExportDataPreviewDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  // 全量工作簿仍会包含每个项目；预览最多展示前三张工作表，避免把所有项目塞进预览页。
  const previewProjects =
    format === 'excel' && scope === 'all'
      ? projects.slice(0, PREVIEW_SHEET_COUNT)
      : projects.slice(0, 1);
  const jsonLines = useMemo(
    () => jsonPreview.split('\n').slice(0, JSON_PREVIEW_LINE_COUNT),
    [jsonPreview],
  );
  const totalTodos = projects.reduce(
    (total, project) => total + (projectTodos[project.id]?.length ?? 0),
    0,
  );
  const title = format === 'json' ? 'JSON 备份预览' : 'Excel 工作簿预览';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[75] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-data-preview-title"
        >
          <div
            className="absolute inset-0 backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(47, 45, 39, 0.4)' }}
            onClick={onClose}
          />
          <motion.div
            className="relative flex w-full max-w-4xl flex-col overflow-hidden rounded-claude border"
            style={{
              maxHeight: '90vh',
              backgroundColor: 'var(--bg-tertiary)',
              borderColor: 'var(--border-color)',
              boxShadow: 'var(--shadow-lg)',
            }}
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          >
            <div
              className="flex items-center justify-between gap-4 border-b px-6 py-4"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <div className="min-w-0">
                <h3
                  id="export-data-preview-title"
                  className="font-serif text-base font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {title}
                </h3>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {format === 'excel' && scope === 'all'
                    ? `预览 ${previewProjects.length} 个工作表 · 最终文件含 ${projects.length} 个工作表`
                    : scope === 'all'
                      ? `${projects.length} 个项目 · ${totalTodos} 项事项`
                      : `${projects[0]?.name ?? '项目'} · ${totalTodos} 项事项`}
                </p>
              </div>
              <span
                className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-subtle)' }}
              >
                {format === 'json' ? '.json' : '.xlsx'}
              </span>
            </div>

            {format === 'json' ? (
              <div
                className="flex-1 overflow-auto p-6"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                <div
                  className="overflow-hidden rounded-lg border"
                  style={{
                    borderColor: 'var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                  }}
                >
                  <div
                    className="flex items-center gap-1.5 border-b px-4 py-2.5"
                    style={{ borderColor: 'var(--border-color)' }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#e57373' }} />
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#e6b65d' }} />
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#7ebd8a' }} />
                    <span className="ml-2 text-[11px]" style={{ color: 'var(--text-quaternary)' }}>
                      backup.json
                    </span>
                  </div>
                  <pre
                    className="overflow-x-auto p-4 font-mono text-xs leading-6"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {jsonLines.join('\n')}
                    {jsonLines.length < jsonPreview.split('\n').length && '\n…'}
                  </pre>
                </div>
              </div>
            ) : (
              <div
                className="flex min-h-0 flex-1 flex-col"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                <div className="min-h-0 flex-1 overflow-auto p-4">
                  <div className="space-y-5">
                    {previewProjects.map((project) => {
                      const previewTodos = projectTodos[project.id] ?? [];
                      return (
                        <section key={project.id}>
                          <div
                            className="mb-2 px-1 text-xs"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            Sheet ·{' '}
                            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                              {project.name}
                            </span>
                          </div>
                          <div
                            className="min-w-[700px] overflow-hidden rounded-lg border"
                            style={{
                              borderColor: 'var(--border-color)',
                              backgroundColor: 'var(--bg-tertiary)',
                            }}
                          >
                            <table className="w-full border-collapse text-left text-xs">
                              <thead
                                style={{
                                  backgroundColor: 'var(--bg-primary)',
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                <tr>
                                  {['标题', '描述', '已完成', '优先级', '创建时间'].map(
                                    (header) => (
                                      <th
                                        key={header}
                                        className="border-b px-3 py-2.5 font-medium"
                                        style={{ borderColor: 'var(--border-color)' }}
                                      >
                                        {header}
                                      </th>
                                    ),
                                  )}
                                </tr>
                              </thead>
                              <tbody style={{ color: 'var(--text-primary)' }}>
                                {previewTodos.slice(0, PREVIEW_ROW_COUNT).map((todo) => (
                                  <tr key={todo.id}>
                                    <td
                                      className="max-w-[180px] truncate border-b px-3 py-2.5 font-medium"
                                      style={{ borderColor: 'var(--border-color)' }}
                                    >
                                      {todo.title}
                                    </td>
                                    <td
                                      className="max-w-[220px] truncate border-b px-3 py-2.5"
                                      style={{
                                        borderColor: 'var(--border-color)',
                                        color: 'var(--text-tertiary)',
                                      }}
                                    >
                                      {todo.description || '—'}
                                    </td>
                                    <td
                                      className="border-b px-3 py-2.5"
                                      style={{ borderColor: 'var(--border-color)' }}
                                    >
                                      {todo.completed ? '是' : '否'}
                                    </td>
                                    <td
                                      className="border-b px-3 py-2.5"
                                      style={{ borderColor: 'var(--border-color)' }}
                                    >
                                      {priorityLabel(todo.priority)}
                                    </td>
                                    <td
                                      className="whitespace-nowrap border-b px-3 py-2.5"
                                      style={{
                                        borderColor: 'var(--border-color)',
                                        color: 'var(--text-tertiary)',
                                      }}
                                    >
                                      {todo.createdAt.slice(0, 16).replace('T', ' ')}
                                    </td>
                                  </tr>
                                ))}
                                {previewTodos.length === 0 && (
                                  <tr>
                                    <td
                                      className="px-3 py-8 text-center"
                                      colSpan={5}
                                      style={{ color: 'var(--text-quaternary)' }}
                                    >
                                      这个工作表暂无事项
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                          {previewTodos.length > PREVIEW_ROW_COUNT && (
                            <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                              已展示前 {PREVIEW_ROW_COUNT} 行；此工作表导出时将包含全部{' '}
                              {previewTodos.length} 项。
                            </p>
                          )}
                        </section>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div
              className="flex items-center gap-3 border-t px-6 py-3"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <p
                className="min-w-0 flex-1 truncate text-xs"
                style={{ color: 'var(--text-quaternary)' }}
              >
                {format === 'excel' && scope === 'all'
                  ? `最多预览 ${PREVIEW_SHEET_COUNT} 个工作表；导出文件将包含全部项目工作表。`
                  : '这是内容预览；下载文件将保留全部数据。'}
              </p>
              <button type="button" className="btn-secondary" onClick={onClose}>
                关闭
              </button>
              <button type="button" className="btn-primary" onClick={onDownload}>
                导出
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
