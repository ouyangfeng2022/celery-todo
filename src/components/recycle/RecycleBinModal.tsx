/**
 * @file RecycleBinModal - 回收站模态框
 * @description 显示已删除的事项，支持恢复和永久删除
 */

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DeletedTodo } from '../../types';
import { formatDate } from '../../utils/helpers';
import { RestoreIcon, TrashIcon, XIcon } from '../common/Icons';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useState } from 'react';

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
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={onClose}
            />

            <motion.div
              className="relative w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl shadow-xl"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-strong)',
              }}
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
            >
              {/* 头部 */}
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
                <h2 className="text-lg font-serif" style={{ color: 'var(--text-primary)' }}>
                  回收站
                </h2>
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
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                      回收站为空
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      删除的事项会在此保留 30 天
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {deletedTodos.map((todo) => (
                      <div
                        key={todo.id}
                        className="flex items-center gap-3 p-3 rounded-lg"
                        style={{
                          backgroundColor: 'var(--bg-secondary)',
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm truncate"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {todo.title}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            删除于 {formatDate(todo.deletedAt)} · {formatDate(todo.expiresAt)} 后自动清除
                          </p>
                        </div>
                        <button
                          onClick={() => onRestore(todo.id)}
                          className="btn-ghost p-1.5"
                          style={{ color: 'var(--accent)' }}
                          aria-label="恢复"
                        >
                          <RestoreIcon size={16} />
                        </button>
                        <button
                          onClick={() => onPermanentDelete(todo.id)}
                          className="btn-ghost p-1.5"
                          style={{ color: 'var(--danger)' }}
                          aria-label="永久删除"
                        >
                          <TrashIcon size={16} />
                        </button>
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
