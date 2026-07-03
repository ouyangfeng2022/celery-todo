/**
 * @file BatchToolbar - 批量操作工具栏
 * @description 当选中多个事项时显示，支持批量完成/删除/设置优先级
 */

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Priority } from '../../types';
import { PRIORITY_LABELS } from '../../types';
import { CheckIcon, TrashIcon, XIcon } from '../common/Icons';

interface BatchToolbarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBatchComplete: () => void;
  onBatchUncomplete: () => void;
  onBatchDelete: () => void;
  onBatchSetPriority: (priority: Priority) => void;
}

function BatchToolbarComponent({
  selectedCount,
  onClearSelection,
  onBatchComplete,
  onBatchUncomplete,
  onBatchDelete,
  onBatchSetPriority,
}: BatchToolbarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40"
        >
          <div
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-strong)',
              boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
            }}
          >
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              已选 {selectedCount} 项
            </span>

            <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--border-color)' }} />

            <button onClick={onBatchComplete} className="btn-ghost text-sm flex items-center gap-1.5">
              <CheckIcon size={14} />
              完成
            </button>

            <button onClick={onBatchUncomplete} className="btn-ghost text-sm">
              取消完成
            </button>

            {/* 优先级下拉 */}
            <div className="relative group">
              <button className="btn-ghost text-sm">优先级</button>
              <div
                className="absolute bottom-full mb-2 left-0 hidden group-hover:block w-32 py-1 rounded-lg shadow-lg z-50"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-strong)',
                }}
              >
                {(['high', 'medium', 'low'] as Priority[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => onBatchSetPriority(p)}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--bg-hover)]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {PRIORITY_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={onBatchDelete}
              className="btn-ghost text-sm flex items-center gap-1.5"
              style={{ color: 'var(--danger)' }}
            >
              <TrashIcon size={14} />
              删除
            </button>

            <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--border-color)' }} />

            <button
              onClick={onClearSelection}
              className="btn-ghost p-1"
              aria-label="取消选择"
            >
              <XIcon size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const BatchToolbar = memo(BatchToolbarComponent);
