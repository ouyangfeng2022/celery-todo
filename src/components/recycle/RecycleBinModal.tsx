/**
 * @file RecycleBinModal - 回收站模态框
 * @description 显示已删除的事项，支持恢复和永久删除
 */

import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DeletedTodo } from '../../types';
import { formatDate, formatRelativeTime } from '../../utils/helpers';
import { RestoreIcon, TrashIcon, XIcon } from '../common/Icons';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface RecycleBinModalProps {
  open: boolean;
  deletedTodos: DeletedTodo[];
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
  onEmptyAll: () => void;
  onClose: () => void;
}

function RecycleBinModalComponent({
  open,
  deletedTodos,
  onRestore,
  onPermanentDelete,
  onEmptyAll,
  onClose,
}: RecycleBinModalProps) {
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0 backdrop-blur-sm"
              style={{ backgroundColor: 'rgba(47, 45, 39, 0.4)' }}
              onClick={onClose}
            />

            <motion.div
              className="relative w-full max-w-2xl max-h-[80vh] flex flex-col rounded-claude overflow-hidden"
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
              {/* 头部 */}
              <div
                className="flex items-center justify-between px-6 py-4 border-b"
                style={{ borderColor: 'var(--border-color)' }}
              >
                <div>
                  <h2
                    className="text-xl font-serif tracking-tight"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    回收站
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    删除的事项会在此保留 30 天
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {deletedTodos.length > 0 && (
                    <button
                      onClick={() => setConfirmEmpty(true)}
                      className="btn-ghost text-sm"
                      style={{ color: 'var(--danger)' }}
                    >
                      清空回收站
                    </button>
                  )}
                  <button onClick={onClose} className="btn-ghost p-1.5" aria-label="关闭">
                    <XIcon size={18} />
                  </button>
                </div>
              </div>

              {/* 列表 */}
              <div className="flex-1 overflow-y-auto p-4">
                {deletedTodos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-quaternary)',
                      }}
                    >
                      <TrashIcon size={24} />
                    </div>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      回收站为空
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {deletedTodos.map((todo) => (
                      <div
                        key={todo.id}
                        className="group flex items-center gap-3 px-3.5 py-3 rounded-lg"
                        style={{
                          backgroundColor: 'var(--bg-secondary)',
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                            {todo.title}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            删除于 {formatRelativeTime(todo.deletedAt)} ·{' '}
                            {formatDate(todo.expiresAt)} 后自动清除
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => onRestore(todo.id)}
                            className="btn-ghost p-1.5"
                            style={{ color: 'var(--accent)' }}
                            aria-label="恢复"
                          >
                            <RestoreIcon size={15} />
                          </button>
                          <button
                            onClick={() => onPermanentDelete(todo.id)}
                            className="btn-ghost p-1.5"
                            style={{ color: 'var(--danger)' }}
                            aria-label="永久删除"
                          >
                            <TrashIcon size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmEmpty}
        title="清空回收站"
        message="此操作将永久删除回收站中的所有事项，无法恢复。确定继续吗？"
        confirmText="永久删除"
        danger
        onConfirm={() => {
          onEmptyAll();
          setConfirmEmpty(false);
        }}
        onCancel={() => setConfirmEmpty(false)}
      />
    </>
  );
}

export const RecycleBinModal = memo(RecycleBinModalComponent);
