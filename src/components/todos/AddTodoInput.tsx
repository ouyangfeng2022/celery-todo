/**
 * @file AddTodoInput - 添加事项输入框
 * @description 支持回车添加、批量添加（逗号/分号分隔）、优先级和截止日期设置
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Priority } from '../../types';
import { PRIORITY_LABELS } from '../../types';
import { PlusIcon } from '../common/Icons';

interface AddTodoInputProps {
  onAdd: (title: string, priority: Priority, dueDate?: string) => void;
  /** 是否聚焦（由快捷键触发） */
  focusSignal?: number;
}

function AddTodoInputComponent({ onAdd, focusSignal }: AddTodoInputProps) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 快捷键聚焦
  useEffect(() => {
    if (focusSignal !== undefined && focusSignal > 0) {
      inputRef.current?.focus();
    }
  }, [focusSignal]);

  // 点击外部收起扩展选项
  useEffect(() => {
    if (!showOptions) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showOptions]);

  const handleAdd = useCallback(() => {
    const trimmed = title.trim();
    if (trimmed.length === 0) return;
    onAdd(trimmed, priority, dueDate || undefined);
    setTitle('');
    setDueDate('');
    // 保持优先级选择不变，方便连续添加
  }, [title, priority, dueDate, onAdd]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd],
  );

  // 检测是否包含分隔符
  const hasSeparator = /[,，;；\n]/.test(title);

  return (
    <div
      ref={wrapRef}
      className="claude-card transition-all"
      style={{
        padding: '0.625rem 0.875rem',
        boxShadow: isFocused ? '0 0 0 3px rgba(217, 119, 87, 0.10)' : 'var(--shadow-xs)',
        borderColor: isFocused ? 'var(--accent)' : 'var(--border-color)',
      }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={handleAdd}
          disabled={title.trim().length === 0}
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'white',
            boxShadow: title.trim() ? '0 2px 6px -1px rgba(217, 119, 87, 0.4)' : 'none',
          }}
          aria-label="添加事项"
        >
          <PlusIcon size={16} />
        </button>

        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setShowOptions(true);
            setIsFocused(true);
          }}
          onBlur={() => setIsFocused(false)}
          placeholder="添加待办事项...（用逗号或分号分隔可批量添加）"
          className="flex-1 bg-transparent border-none outline-none text-base"
          style={{ color: 'var(--text-primary)' }}
        />

        {hasSeparator && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="claude-tag flex-shrink-0"
            style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent)' }}
          >
            批量添加
          </motion.span>
        )}
      </div>

      {/* 扩展选项 */}
      <AnimatePresence initial={false}>
        {showOptions && (
          <motion.div
            key="options"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
              opacity: { duration: 0.18, ease: 'easeOut' },
            }}
            style={{ overflow: 'hidden' }}
          >
            <div
              className="flex items-center gap-3 mt-2.5 pt-2.5 border-t"
              style={{ borderColor: 'var(--border-color)' }}
            >
              {/* 优先级选择 - segmented control 风格 */}
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  优先级
                </span>
                <div
                  className="flex gap-0.5 p-0.5 rounded-md"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  {(['high', 'medium', 'low'] as Priority[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPriority(p)}
                      className="px-2 py-0.5 rounded text-xs font-medium transition-all"
                      style={{
                        backgroundColor: priority === p ? 'var(--bg-tertiary)' : 'transparent',
                        color: priority === p ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        boxShadow: priority === p ? 'var(--shadow-xs)' : 'none',
                      }}
                    >
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              {/* 截止日期 */}
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  截止
                </span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="text-xs px-2 py-0.5 rounded-md border-none bg-transparent"
                  style={{
                    color: 'var(--text-secondary)',
                    backgroundColor: 'var(--bg-secondary)',
                  }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const AddTodoInput = memo(AddTodoInputComponent);
