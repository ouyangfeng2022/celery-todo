/**
 * @file TodoItem - 单个事项组件
 * @description 支持完成切换、编辑、删除、优先级、截止日期、Markdown 渲染
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import type { Todo, Priority } from '../../types';
import { PRIORITY_LABELS, PRIORITY_COLORS } from '../../types';
import { cn, formatDate, isOverdue, isDueSoon } from '../../utils/helpers';
import { CheckIcon, EditIcon, TrashIcon, CalendarIcon, AlertIcon, GripIcon } from '../common/Icons';

export interface TodoItemProps {
  todo: Todo;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onEdit: (id: string, updates: Partial<Todo>) => void;
  onDelete: (id: string) => void;
  onToggleSelect: (id: string) => void;
  /** 拖拽手柄属性（由 dnd-kit 注入） */
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}

function TodoItemComponent({
  todo,
  isSelected,
  onToggle,
  onEdit,
  onDelete,
  onToggleSelect,
  dragHandleProps,
}: TodoItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);
  const [editDescription, setEditDescription] = useState(todo.description ?? '');
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  // 进入编辑模式时聚焦
  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = useCallback(() => {
    setEditTitle(todo.title);
    setEditDescription(todo.description ?? '');
    setIsEditing(true);
  }, [todo.title, todo.description]);

  const handleSaveEdit = useCallback(() => {
    const trimmed = editTitle.trim();
    if (trimmed.length === 0) {
      setIsEditing(false);
      return;
    }
    onEdit(todo.id, {
      title: trimmed,
      description: editDescription.trim() || undefined,
    });
    setIsEditing(false);
  }, [editTitle, editDescription, todo.id, onEdit]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditTitle(todo.title);
    setEditDescription(todo.description ?? '');
  }, [todo.title, todo.description]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSaveEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancelEdit();
      }
    },
    [handleSaveEdit, handleCancelEdit],
  );

  const overdue = !todo.completed && isOverdue(todo.dueDate);
  const dueSoon = !todo.completed && isDueSoon(todo.dueDate);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        'group relative flex items-start gap-3 p-3 rounded-claude transition-colors',
        'hover:bg-[var(--bg-hover)]',
        isSelected && 'bg-[var(--accent-light)]',
        overdue && 'border-l-2',
      )}
      style={overdue ? { borderLeftColor: 'var(--danger)' } : undefined}
    >
      {/* 拖拽手柄 */}
      {dragHandleProps && (
        <button
          {...dragHandleProps}
          className="absolute left-0 top-1/2 -translate-y-1/2 -ml-1 p-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: 'var(--text-tertiary)' }}
          aria-label="拖拽排序"
        >
          <GripIcon size={16} />
        </button>
      )}

      {/* 完成状态复选框 */}
      <button
        onClick={() => onToggle(todo.id)}
        className={cn(
          'mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
          todo.completed
            ? 'bg-[var(--accent)] border-[var(--accent)]'
            : 'border-[var(--border-strong)] hover:border-[var(--accent)]',
        )}
        aria-label={todo.completed ? '标记为未完成' : '标记为已完成'}
      >
        {todo.completed && <CheckIcon size={12} className="text-white" />}
      </button>

      {/* 内容区域 */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="space-y-2" onKeyDown={handleKeyDown}>
            <textarea
              ref={editInputRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="claude-input resize-none font-medium"
              rows={1}
              placeholder="事项标题"
            />
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="claude-input resize-none text-sm"
              rows={3}
              placeholder="描述（支持 Markdown：**粗体** *斜体* `代码` [链接](url)）"
            />
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              <kbd className="px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--border-strong)' }}>
                ⌘+Enter
              </kbd>
              <span>保存</span>
              <kbd className="px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--border-strong)' }}>
                Esc
              </kbd>
              <span>取消</span>
              <button className="btn-ghost ml-auto" onClick={handleCancelEdit}>
                取消
              </button>
              <button className="btn-primary" onClick={handleSaveEdit}>
                保存
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 标题 */}
            <div
              onDoubleClick={handleStartEdit}
              className={cn(
                'font-medium cursor-text break-words',
                todo.completed && 'line-through',
              )}
              style={{
                color: todo.completed ? 'var(--text-tertiary)' : 'var(--text-primary)',
              }}
            >
              {todo.title}
            </div>

            {/* 描述（Markdown 渲染） */}
            {todo.description && (
              <div
                className="markdown-body mt-1 text-sm"
                style={{ color: 'var(--text-secondary)' }}
                onDoubleClick={handleStartEdit}
              >
                <ReactMarkdown>{todo.description}</ReactMarkdown>
              </div>
            )}

            {/* 元信息标签 */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {/* 优先级 */}
              <span className={cn('claude-tag', PRIORITY_COLORS[todo.priority])}>
                {PRIORITY_LABELS[todo.priority]}
              </span>

              {/* 截止日期 */}
              {todo.dueDate && (
                <span
                  className="claude-tag gap-1"
                  style={{
                    backgroundColor: overdue ? 'var(--danger-light)' : 'var(--bg-secondary)',
                    color: overdue ? 'var(--danger)' : dueSoon ? 'var(--warning)' : 'var(--text-secondary)',
                  }}
                >
                  {overdue ? <AlertIcon size={12} /> : <CalendarIcon size={12} />}
                  {formatDate(todo.dueDate)}
                  {overdue && ' · 已过期'}
                </span>
              )}

              {/* 创建时间 */}
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {formatDate(todo.createdAt)}创建
              </span>
            </div>
          </>
        )}
      </div>

      {/* 操作按钮 */}
      {!isEditing && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* 优先级快速切换 */}
          <select
            value={todo.priority}
            onChange={(e) => onEdit(todo.id, { priority: e.target.value as Priority })}
            className="text-xs px-2 py-1 rounded border-none bg-transparent cursor-pointer"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label="设置优先级"
          >
            <option value="high">高优先级</option>
            <option value="medium">中优先级</option>
            <option value="low">低优先级</option>
          </select>

          {/* 截止日期 */}
          <input
            type="date"
            value={todo.dueDate?.split('T')[0] ?? ''}
            onChange={(e) =>
              onEdit(todo.id, {
                dueDate: e.target.value ? new Date(e.target.value).toISOString() : undefined,
              })
            }
            className="text-xs px-2 py-1 rounded border-none bg-transparent cursor-pointer"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label="设置截止日期"
          />

          <button
            onClick={handleStartEdit}
            className="btn-ghost p-1.5"
            aria-label="编辑"
          >
            <EditIcon size={16} />
          </button>

          <button
            onClick={() => onDelete(todo.id)}
            className="btn-ghost p-1.5 hover:text-[var(--danger)]"
            aria-label="删除"
          >
            <TrashIcon size={16} />
          </button>
        </div>
      )}

      {/* 批量选择复选框（悬浮时显示在最右侧并垂直居中） */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggleSelect(todo.id)}
        className="self-center w-4 h-4 rounded cursor-pointer accent-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ opacity: isSelected ? 1 : undefined }}
        aria-label="选择事项"
      />
    </motion.div>
  );
}

export const TodoItem = memo(TodoItemComponent);
