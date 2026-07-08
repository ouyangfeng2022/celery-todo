/**
 * @file TodoItem - 单个事项组件
 * @description 支持完成切换、编辑、删除、优先级、截止日期、Markdown 渲染
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import type { Todo, Priority } from '../../types';
import { PRIORITY_LABELS, PRIORITY_COLORS } from '../../types';
import { cn, formatDate, formatRelativeTime, isOverdue, isDueSoon } from '../../utils/helpers';
import {
  CheckIcon,
  EditIcon,
  TrashIcon,
  CalendarIcon,
  AlertIcon,
  GripIcon,
  FlagIcon,
} from '../common/Icons';

/** 优先级对应的圆点颜色（用于动作栏的旗帜图标着色） */
const PRIORITY_DOT_STYLE: Record<Priority, string> = {
  high: 'var(--danger)',
  medium: 'var(--warning)',
  low: 'var(--text-quaternary)',
};

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

/** 统一动作栏的图标按钮：固定 28×28 命中区，垂直居中 */
function DockButton({
  label,
  onClick,
  children,
  danger,
  active,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-colors',
        'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
        danger && 'hover:text-[var(--danger)]',
        active && 'text-[var(--accent)]',
      )}
    >
      {children}
    </button>
  );
}

/**
 * 优先级选择弹出菜单：替代原生 <select>，保证与其它图标按钮在动作栏中尺寸一致。
 * 点击旗帜按钮展开三个选项，再次点击或点击外部收起。
 */
function PriorityMenu({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <DockButton label="设置优先级" onClick={() => setOpen((v) => !v)} active={open}>
        <span className="relative">
          <FlagIcon size={15} />
          {/* 优先级颜色指示点：右下角 */}
          <span
            className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-[var(--bg-tertiary)]"
            style={{ backgroundColor: PRIORITY_DOT_STYLE[value] }}
          />
        </span>
      </DockButton>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.13 }}
            className="absolute right-0 top-full mt-1 z-30 min-w-[7rem] py-1 rounded-md border"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              borderColor: 'var(--border-color)',
              boxShadow: 'var(--shadow-md, 0 4px 12px rgba(0,0,0,0.08))',
            }}
          >
            {(['high', 'medium', 'low'] as Priority[]).map((p) => (
              <button
                key={p}
                onClick={() => {
                  onChange(p);
                  setOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-1.5 text-xs transition-colors text-left',
                  'hover:bg-[var(--bg-hover)]',
                )}
                style={{
                  color: p === value ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: PRIORITY_DOT_STYLE[p] }}
                />
                <span className="flex-1">{PRIORITY_LABELS[p]}优先级</span>
                {p === value && <CheckIcon size={12} className="text-[var(--accent)]" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * 截止日期触发器：把原生 date input 折叠为日历图标按钮，点击展开。
 * 与动作栏其它按钮保持一致的 28×28 命中区。
 */
function DueDateButton({ value, onChange }: { value?: string; onChange: (iso?: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasDate = Boolean(value);

  return (
    <label
      className={cn(
        'flex-shrink-0 relative w-7 h-7 flex items-center justify-center rounded-md cursor-pointer transition-colors',
        'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
      )}
      title="设置截止日期"
    >
      <CalendarIcon size={15} />
      {hasDate && (
        <span
          className="absolute -bottom-0 -right-0 w-1.5 h-1.5 rounded-full border border-[var(--bg-tertiary)]"
          style={{ backgroundColor: 'var(--accent)' }}
        />
      )}
      {/* 可见但透明的原生日期控件：点击图标即触发原生选择器，且支持键盘 */}
      <input
        ref={inputRef}
        type="date"
        value={value?.split('T')[0] ?? ''}
        onChange={(e) =>
          onChange(e.target.value ? new Date(e.target.value).toISOString() : undefined)
        }
        tabIndex={-1}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        aria-label="设置截止日期"
      />
    </label>
  );
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
        'group relative flex items-center gap-3 pl-3.5 pr-2 py-2.5 rounded-claude transition-colors',
        'hover:bg-[var(--bg-hover)]',
        isSelected && 'bg-[var(--accent-subtle)]',
      )}
      style={undefined}
    >
      {/* 拖拽手柄：绝对定位，悬浮显示在左侧，不占布局空间 */}
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

      {/* 完成状态复选框：与标题首行对齐（标题行高 1.3125rem ≈ 21px，复选框 18px） */}
      <button
        onClick={() => onToggle(todo.id)}
        className={cn(
          'flex-shrink-0 w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center transition-all',
          todo.completed
            ? 'bg-[var(--accent)] border-[var(--accent)]'
            : 'border-[var(--border-strong)] hover:border-[var(--accent)]',
        )}
        aria-label={todo.completed ? '标记为未完成' : '标记为已完成'}
      >
        {todo.completed && <CheckIcon size={11} className="text-white" />}
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
            <div
              className="flex items-center gap-2 text-xs"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <kbd
                className="px-1.5 py-0.5 rounded border"
                style={{ borderColor: 'var(--border-strong)' }}
              >
                ⌘+Enter
              </kbd>
              <span>保存</span>
              <kbd
                className="px-1.5 py-0.5 rounded border"
                style={{ borderColor: 'var(--border-strong)' }}
              >
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
                'text-[15px] leading-snug cursor-text break-words text-pretty transition-colors',
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
                className="markdown-body mt-1 text-[13px]"
                style={{ color: 'var(--text-secondary)' }}
                onDoubleClick={handleStartEdit}
              >
                <ReactMarkdown>{todo.description}</ReactMarkdown>
              </div>
            )}

            {/* 元信息标签 */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {/* 优先级 - 使用 PRIORITY_COLORS，但配色与品牌协调 */}
              <span className={cn('claude-tag', PRIORITY_COLORS[todo.priority])}>
                {PRIORITY_LABELS[todo.priority]}
              </span>

              {/* 截止日期 */}
              {todo.dueDate && (
                <span
                  className="claude-tag gap-1"
                  style={{
                    backgroundColor: overdue ? 'var(--danger-subtle)' : 'transparent',
                    color: overdue
                      ? 'var(--danger)'
                      : dueSoon
                        ? 'var(--warning)'
                        : 'var(--text-tertiary)',
                    border: overdue || dueSoon ? 'none' : `1px solid var(--border-color)`,
                  }}
                >
                  {overdue ? <AlertIcon size={11} /> : <CalendarIcon size={11} />}
                  {formatDate(todo.dueDate)}
                  {overdue && ' · 已过期'}
                </span>
              )}

              {/* 创建时间 */}
              <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                {formatRelativeTime(todo.createdAt)}创建
              </span>
            </div>
          </>
        )}
      </div>

      {/* 统一动作栏：所有图标统一 28×28 命中区，垂直居中，固定宽度避免悬浮抖动 */}
      {!isEditing && (
        <div
          className={cn(
            'flex-shrink-0 flex items-center gap-0.5 rounded-md transition-opacity',
            isSelected
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
          )}
        >
          <PriorityMenu value={todo.priority} onChange={(p) => onEdit(todo.id, { priority: p })} />
          <DueDateButton
            value={todo.dueDate}
            onChange={(iso) => onEdit(todo.id, { dueDate: iso })}
          />
          <span className="mx-0.5 h-4 w-px" style={{ backgroundColor: 'var(--border-color)' }} />
          <DockButton label="编辑" onClick={handleStartEdit}>
            <EditIcon size={15} />
          </DockButton>
          <DockButton label="删除" danger onClick={() => onDelete(todo.id)}>
            <TrashIcon size={15} />
          </DockButton>
          {/* 批量选择：与其它图标同高，但用复选框语义 */}
          <span className="mx-0.5 h-4 w-px" style={{ backgroundColor: 'var(--border-color)' }} />
          <label
            className={cn(
              'flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md cursor-pointer transition-colors',
              'hover:bg-[var(--bg-hover)]',
            )}
            title="选择事项"
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(todo.id)}
              className="w-[14px] h-[14px] cursor-pointer accent-[var(--accent)]"
              aria-label="选择事项"
            />
          </label>
        </div>
      )}
    </motion.div>
  );
}

export const TodoItem = memo(TodoItemComponent);
