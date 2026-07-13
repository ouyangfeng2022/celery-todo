/**
 * @file ArchiveHistoryView - 历史记录视图（HistoryPanel 弹窗的正文）
 * @description 展示全部归档事项（跨项目），支持恢复、永久删除、清空全部归档。
 *              归档永久保留，不自动清除——唯一删除途径是本视图的手动操作。
 */

import { memo, useMemo, useState } from 'react';
import type { DeletedTodo, Project } from '../../types';
import { formatRelativeTime } from '../../utils/helpers';
import { RestoreIcon, TrashIcon, InboxIcon } from '../common/Icons';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface ArchiveHistoryViewProps {
  /** 全部归档事项（跨项目，已按归档时间倒序） */
  archivedTodos: DeletedTodo[];
  /** 全部项目（用于按 projectId 解析项目名标签） */
  projects: Project[];
  /** 恢复单条归档（重新回到其原属项目） */
  onRestore: (id: string) => void;
  /** 永久删除单条归档 */
  onPermanentDelete: (id: string) => void;
  /** 清空全部归档 */
  onEmptyAll: () => void;
}

function ArchiveHistoryViewComponent({
  archivedTodos,
  projects,
  onRestore,
  onPermanentDelete,
  onEmptyAll,
}: ArchiveHistoryViewProps) {
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  // projectId -> Project 查找表，用于每行显示项目名标签
  const projectNameById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  return (
    <div className="space-y-3">
      {/* 标题行 + 清空按钮 */}
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          归档的事项会保存在此处，可在任意时间恢复或永久删除。
        </p>
        {archivedTodos.length > 0 && (
          <button
            onClick={() => setConfirmEmpty(true)}
            className="btn-ghost text-sm flex-shrink-0"
            style={{ color: 'var(--danger)' }}
          >
            清空归档
          </button>
        )}
      </div>

      {/* 列表 */}
      {archivedTodos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-quaternary)',
            }}
          >
            <InboxIcon size={24} />
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            暂无历史记录
          </p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[55vh] overflow-y-auto -mx-1 px-1">
          {archivedTodos.map((todo) => {
            const project = projectNameById.get(todo.projectId);
            return (
              <div
                key={todo.id}
                className="group flex items-center gap-3 px-3.5 py-3 rounded-lg"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p
                      className="text-sm truncate flex-1 min-w-0"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {todo.title}
                    </p>
                    {project && (
                      <span
                        className="claude-tag shrink-0"
                        style={{
                          color: 'var(--text-tertiary)',
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        {project.name}
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    归档于 {formatRelativeTime(todo.deletedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onRestore(todo.id)}
                    className="btn-ghost p-1.5"
                    style={{ color: 'var(--accent)' }}
                    aria-label="恢复"
                    title="恢复"
                  >
                    <RestoreIcon size={15} />
                  </button>
                  <button
                    onClick={() => onPermanentDelete(todo.id)}
                    className="btn-ghost p-1.5"
                    style={{ color: 'var(--danger)' }}
                    aria-label="永久删除"
                    title="永久删除"
                  >
                    <TrashIcon size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirmEmpty}
        title="清空归档"
        message="此操作将永久删除所有归档事项，无法恢复。确定继续吗？"
        confirmText="永久删除"
        danger
        onConfirm={() => {
          onEmptyAll();
          setConfirmEmpty(false);
        }}
        onCancel={() => setConfirmEmpty(false)}
      />
    </div>
  );
}

export const ArchiveHistoryView = memo(ArchiveHistoryViewComponent);
