/**
 * @file TodoItem - 单个事项组件
 * @description 支持完成切换、编辑、归档、优先级、Markdown 渲染
 */

import { memo, useState, useCallback, useRef, useEffect, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Todo, Priority } from '../../types';
import { PRIORITY_LABELS, PRIORITY_COLORS, PRIORITY_SOLID } from '../../types';
import { cn, formatRelativeTime, formatDateTime } from '../../utils/helpers';
import { useDismissibleLayer } from '../../hooks/useDismissibleLayer';
import { useSettingsStore } from '../../store/useSettingsStore';
import { autosizeTextarea, TEXTAREA_MAX_HEIGHT } from '../../utils/textarea';
import { CheckIcon, EditIcon, ArchiveIcon, GripIcon, PinIcon } from '../common/Icons';
import { MarkdownContent } from '../common/MarkdownContent';

export interface TodoItemProps {
  todo: Todo;
  isSelected: boolean;
  /** 全局搜索定位时递增，触发一次短暂高亮。 */
  focusSignal?: number;
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
 * 优先级选择弹出菜单：以传入的触发器（元信息行的“高/中/低”标签）展开下拉。
 * 点击触发器展开三个选项，再次点击或点击外部收起。
 */
function PriorityMenu({
  value,
  onChange,
  trigger,
}: {
  value: Priority;
  onChange: (p: Priority) => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useDismissibleLayer(open, [wrapRef], () => setOpen(false));

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="设置优先级"
        title="设置优先级"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {trigger}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="优先级"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.13 }}
            className="absolute left-0 top-full mt-1 z-30 min-w-[7rem] py-1 rounded-md border"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              borderColor: 'var(--border-color)',
              boxShadow: 'var(--shadow-md, 0 4px 12px rgba(0,0,0,0.08))',
            }}
          >
            {(['high', 'medium', 'low'] as Priority[]).map((p) => (
              <button
                key={p}
                role="menuitemradio"
                aria-checked={p === value}
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
                  style={{ backgroundColor: PRIORITY_SOLID[p] }}
                />
                <span className="flex-1">{PRIORITY_LABELS[p]}</span>
                {/* 对勾位固定占位，避免选中态切换导致菜单宽度抖动 */}
                <span className="w-3 h-3 flex items-center justify-center">
                  {p === value && <CheckIcon size={12} className="text-[var(--accent)]" />}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const TodoItemComponent = forwardRef<HTMLDivElement, TodoItemProps>(function TodoItemComponent(
  { todo, isSelected, focusSignal, onToggle, onEdit, onDelete, onToggleSelect, dragHandleProps },
  ref,
) {
  // 平台相关快捷键提示：Mac 显示 ⌘，Win/Linux 显示 Ctrl
  const isMac = window.electronAPI?.platform === 'darwin';
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);
  const [editDescription, setEditDescription] = useState(todo.description ?? '');
  const [isSearchHighlighted, setIsSearchHighlighted] = useState(false);
  // 时间格式为全局设置：任一事项上点击都会切换全应用的相对/精确计时
  const timeFormat = useSettingsStore((s) => s.timeFormat);
  const setTimeFormat = useSettingsStore((s) => s.setTimeFormat);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const editDescriptionRef = useRef<HTMLTextAreaElement>(null);

  // 进入编辑模式时聚焦标题
  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  // 编辑态：标题/描述按内容自适应高度。进入编辑时把已保存内容一次性撑到真实高度，
  // 之后随输入更新。超过最大高度后由 textarea 自身滚动承接（见下面 textarea 的 maxHeight）。
  useEffect(() => {
    if (isEditing) {
      autosizeTextarea(editInputRef.current);
      autosizeTextarea(editDescriptionRef.current);
    }
  }, [isEditing, editTitle, editDescription]);

  useEffect(() => {
    if (!focusSignal) return;
    setIsSearchHighlighted(true);
    const timer = window.setTimeout(() => setIsSearchHighlighted(false), 1600);
    return () => window.clearTimeout(timer);
  }, [focusSignal]);

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

  // 不阻止原生右键菜单，让浏览器处理复制等操作

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

  return (
    <div
      ref={ref}
      className={cn(
        'group relative flex items-center gap-3 pl-3.5 pr-2 py-2.5 rounded-claude transition-colors',
        'hover:bg-[var(--bg-hover)]',
        // 置顶行：加深底色 + 左侧珊瑚色条，强化置顶信号
        todo.pinned &&
          'bg-[var(--pinned-bg)] hover:bg-[var(--pinned-bg)] shadow-[inset_3px_0_var(--accent)]',
        isSelected && 'bg-[var(--accent-subtle)]',
        isSearchHighlighted &&
          'bg-[var(--accent-subtle)] ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-primary)]',
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
              className="claude-input resize-none overflow-y-auto leading-6"
              style={{ minHeight: '1.5rem', maxHeight: TEXTAREA_MAX_HEIGHT }}
              rows={1}
              placeholder="事项标题"
            />
            <textarea
              ref={editDescriptionRef}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              aria-label="事项描述"
              className="claude-input resize-none overflow-y-auto text-sm leading-6"
              style={{ minHeight: '4.5rem', maxHeight: TEXTAREA_MAX_HEIGHT }}
              rows={3}
              placeholder="描述"
            />
            <div
              className="flex items-center gap-2 text-xs"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <kbd
                className="px-1.5 py-0.5 rounded border"
                style={{ borderColor: 'var(--border-strong)' }}
              >
                {isMac ? '⌘+Enter' : 'Ctrl+Enter'}
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
                fontFamily: 'var(--font-heading)',
                fontWeight: 500,
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
                <MarkdownContent content={todo.description} />
              </div>
            )}

            {/* 元信息标签 */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {/* 优先级 - 点击“高/中/低”标签展开菜单切换；左侧 2px 色条 + 加粗字 */}
              <PriorityMenu
                value={todo.priority}
                onChange={(p) => onEdit(todo.id, { priority: p })}
                trigger={
                  <span
                    className={cn(
                      'claude-tag font-semibold cursor-pointer transition-opacity',
                      PRIORITY_COLORS[todo.priority],
                      'hover:opacity-80',
                    )}
                    style={{ borderLeft: `2px solid ${PRIORITY_SOLID[todo.priority]}` }}
                  >
                    {PRIORITY_LABELS[todo.priority]}
                  </span>
                }
              />

              {/* 置顶标识 */}
              {todo.pinned && (
                <span
                  className="claude-tag inline-flex items-center gap-0.5"
                  style={{ color: 'var(--accent)' }}
                >
                  <PinIcon size={11} />
                  置顶
                </span>
              )}

              {/* 创建时间：点击在 模糊计时 ↔ 精确计时（精确到分钟）间切换（全局生效） */}
              <span
                role="button"
                tabIndex={0}
                onClick={() => setTimeFormat(timeFormat === 'exact' ? 'relative' : 'exact')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setTimeFormat(timeFormat === 'exact' ? 'relative' : 'exact');
                  }
                }}
                className="text-[11px] cursor-pointer select-none hover:opacity-80 transition-opacity"
                style={{ color: 'var(--text-tertiary)' }}
                title={timeFormat === 'exact' ? '点击切换为相对时间' : '点击切换为精确时间'}
              >
                {timeFormat === 'exact'
                  ? `${formatDateTime(todo.createdAt)} 创建`
                  : `${formatRelativeTime(todo.createdAt)}创建`}
              </span>

              {/* 完成时间：与创建时间共用全局 timeFormat 设置 */}
              {todo.completedAt && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => setTimeFormat(timeFormat === 'exact' ? 'relative' : 'exact')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setTimeFormat(timeFormat === 'exact' ? 'relative' : 'exact');
                    }
                  }}
                  className="text-[11px] cursor-pointer select-none hover:opacity-80 transition-opacity"
                  style={{ color: 'var(--success)' }}
                  title={timeFormat === 'exact' ? '点击切换为相对时间' : '点击切换为精确时间'}
                >
                  {timeFormat === 'exact'
                    ? `${formatDateTime(todo.completedAt)} 完成`
                    : `${formatRelativeTime(todo.completedAt)}完成`}
                </span>
              )}
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
          <DockButton
            label={todo.pinned ? '取消置顶' : '置顶'}
            active={todo.pinned}
            onClick={() => onEdit(todo.id, { pinned: !todo.pinned })}
          >
            <PinIcon size={15} />
          </DockButton>
          <span className="mx-0.5 h-4 w-px" style={{ backgroundColor: 'var(--border-color)' }} />
          <DockButton label="编辑" onClick={handleStartEdit}>
            <EditIcon size={15} />
          </DockButton>
          <DockButton label="归档" danger onClick={() => onDelete(todo.id)}>
            <ArchiveIcon size={15} />
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
    </div>
  );
});

export const TodoItem = memo(TodoItemComponent);
