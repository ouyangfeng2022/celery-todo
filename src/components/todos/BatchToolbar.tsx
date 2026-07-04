/**
 * @file BatchToolbar - 批量操作工具栏
 * @description 当选中多个事项时显示，支持批量完成/删除/设置优先级
 */

import { memo, useState, useRef, useEffect } from 'react';
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
  const [priorityOpen, setPriorityOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭优先级菜单
  useEffect(() => {
    if (!priorityOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setPriorityOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [priorityOpen]);

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
            className="flex items-center gap-1 px-3 py-2 rounded-xl"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-strong)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <span
              className="text-sm font-medium px-2"
              style={{ color: 'var(--text-primary)' }}
            >
              <span
                className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 mr-1.5 rounded-full text-[11px] font-semibold tabular-nums"
                style={{ backgroundColor: 'var(--accent)', color: 'white' }}
              >
                {selectedCount}
              </span>
              已选
            </span>

            <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--border-color)' }} />

            <button
              onClick={onBatchComplete}
              className="btn-ghost text-sm flex items-center gap-1.5"
            >
              <CheckIcon size={14} />
              完成
            </button>

            <button onClick={onBatchUncomplete} className="btn-ghost text-sm">
              取消完成
            </button>

            {/* 优先级下拉 - 使用受控菜单避免被裁切 */}
            <div ref={wrapRef} className="relative">
              <button
                onClick={() => setPriorityOpen((v) => !v)}
                className="btn-ghost text-sm"
                style={{ color: priorityOpen ? 'var(--accent)' : undefined }}
              >
                优先级
              </button>
              <AnimatePresence>
                {priorityOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.97 }}
                    transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                    className="absolute bottom-full mb-2 left-0 w-32 py-1 rounded-lg"
                    style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-strong)',
                      boxShadow: 'var(--shadow-md)',
                    }}
                  >
                    {(['high', 'medium', 'low'] as Priority[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => {
                          onBatchSetPriority(p);
                          setPriorityOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--bg-hover)] transition-colors"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {PRIORITY_LABELS[p]}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
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
