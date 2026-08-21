/**
 * @file TodoItem - 单个事项组件
 * @description 支持完成切换、归档、优先级、点击标题打开详情浮窗。
 *              描述与编辑能力已迁移到 TodoDetailDialog；本组件仅负责列表/卡片
 *              内的紧凑展示（标题 + 元信息标签 + 动作栏）。
 */

import { memo, useState, useCallback, useEffect, useRef, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Todo, Priority } from '../../types';
import { PRIORITY_LABELS, PRIORITY_COLORS, PRIORITY_SOLID } from '../../types';
import { cn, formatRelativeTime, formatDateTime } from '../../utils/helpers';
import { formatPlannedDate } from '../../utils/planning';
import { useDismissibleLayer } from '../../hooks/useDismissibleLayer';
import { useSettingsStore } from '../../store/useSettingsStore';
import { CheckIcon, EditIcon, ArchiveIcon, GripIcon, PinIcon, CalendarIcon } from '../common/Icons';

export interface TodoItemProps {
  todo: Todo;
  isSelected: boolean;
  /** 全局搜索定位时递增，触发一次短暂高亮。 */
  focusSignal?: number;
  onToggle: (id: string) => void;
  onEdit: (id: string, updates: Partial<Todo>) => void;
  onDelete: (id: string) => void;
  onToggleSelect: (id: string) => void;
  /** 点击标题/编辑按钮 → 打开详情浮窗（在 App 顶层渲染） */
  onOpenDetail: (id: string) => void;
  /** 拖拽手柄属性（由 dnd-kit 注入） */
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  selectable?: boolean;
  /** 列表行或卡片；卡片模式由外层按计划日期分组。 */
  view?: 'list' | 'card';
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
  {
    todo,
    isSelected,
    focusSignal,
    onToggle,
    onEdit,
    onDelete,
    onToggleSelect,
    onOpenDetail,
    dragHandleProps,
    selectable = true,
    view = 'list',
  },
  ref,
) {
  const isCard = view === 'card';
  const [isSearchHighlighted, setIsSearchHighlighted] = useState(false);
  // 时间格式为全局设置：任一事项上点击都会切换全应用的相对/精确计时
  const timeFormat = useSettingsStore((s) => s.timeFormat);
  const setTimeFormat = useSettingsStore((s) => s.setTimeFormat);

  useEffect(() => {
    if (!focusSignal) return;
    setIsSearchHighlighted(true);
    const timer = window.setTimeout(() => setIsSearchHighlighted(false), 1600);
    return () => window.clearTimeout(timer);
  }, [focusSignal]);

  // 标题/键盘入口触发：打开详情浮窗
  const openDetail = useCallback(() => onOpenDetail(todo.id), [onOpenDetail, todo.id]);

  // 容器点击：若点击落在交互元素（复选框/动作栏/优先级菜单等）上，让该元素自己
  // 处理；否则视为「点击标题或空白」→ 打开详情浮窗。
  // 时间标签等需要独占点击语义的 role="button" 元素，单独用 data-no-open-detail 标记。
  // 用 closest 判定，无需给每个子按钮加 stopPropagation。
  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, textarea, select, label, [data-no-open-detail]')) {
        return;
      }
      openDetail();
    },
    [openDetail],
  );

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDetail();
      }
    },
    [openDetail],
  );

  return (
    <div
      ref={ref}
      onClick={handleContainerClick}
      className={cn(
        'group relative flex cursor-pointer transition-colors',
        isCard
          ? 'min-h-[164px] flex-col items-stretch gap-3 rounded-xl border bg-[var(--bg-secondary)] p-4 hover:bg-[var(--bg-tertiary)]'
          : 'items-center gap-3 rounded-claude py-2.5 pl-3.5 pr-2 hover:bg-[var(--bg-hover)]',
        // 置顶行：加深底色 + 左侧珊瑚色条，强化置顶信号
        todo.pinned &&
          'bg-[var(--pinned-bg)] hover:bg-[var(--pinned-bg)] shadow-[inset_3px_0_var(--accent)]',
        isSelected && 'bg-[var(--accent-subtle)]',
        isSearchHighlighted &&
          'bg-[var(--accent-subtle)] ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-primary)]',
      )}
      style={
        isCard ? { borderColor: 'var(--border-color)', boxShadow: 'var(--shadow-xs)' } : undefined
      }
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
          isCard && 'absolute right-4 top-4',
          todo.completed
            ? 'bg-[var(--accent)] border-[var(--accent)]'
            : 'border-[var(--border-strong)] hover:border-[var(--accent)]',
        )}
        aria-label={todo.completed ? '标记为未完成' : '标记为已完成'}
        title={todo.completed ? '标记为未完成' : '标记为已完成'}
      >
        {todo.completed && <CheckIcon size={11} className="text-white" />}
      </button>

      {/* 内容区域 */}
      <div className={cn('min-w-0 flex-1', isCard && 'pr-7')}>
        {/* 标题：点击由容器统一处理；键盘 Enter/Space 也能打开浮窗 */}
        <div
          role="button"
          tabIndex={0}
          onKeyDown={handleTitleKeyDown}
          className={cn(
            'text-[15px] leading-snug break-words text-pretty transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] rounded',
            todo.completed && 'line-through',
          )}
          style={{
            color: todo.completed ? 'var(--text-tertiary)' : 'var(--text-primary)',
            fontFamily: 'var(--font-heading)',
            fontWeight: 500,
          }}
          title="点击查看详情"
        >
          {todo.title}
        </div>

        {/* 描述预览：仅显示开头一行（省略号截断），完整内容点击打开详情浮窗查看 */}
        {todo.description?.trim() && (
          <div
            className="mt-1 text-xs leading-snug truncate"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {todo.description.trim()}
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

          {!isCard && todo.plannedDate && (
            <span
              className="claude-tag inline-flex items-center gap-1"
              style={{ color: 'var(--text-secondary)' }}
              title={todo.plannedDate}
            >
              <CalendarIcon size={11} />
              {formatPlannedDate(todo.plannedDate)}
            </span>
          )}

          {/* 创建时间：点击在 模糊计时 ↔ 精确计时（精确到分钟）间切换（全局生效） */}
          {!isCard && (
            <span
              role="button"
              tabIndex={0}
              data-no-open-detail
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
          )}

          {/* 完成时间：与创建时间共用全局 timeFormat 设置 */}
          {!isCard && todo.completedAt && (
            <span
              role="button"
              tabIndex={0}
              data-no-open-detail
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
      </div>

      {/* 统一动作栏：所有图标统一 28×28 命中区，垂直居中，固定宽度避免悬浮抖动 */}
      <div
        className={cn(
          'flex-shrink-0 flex items-center gap-0.5 rounded-md transition-opacity',
          isCard
            ? 'mt-auto w-full justify-end border-t pt-2 opacity-70 group-hover:opacity-100 focus-within:opacity-100'
            : isSelected
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
        )}
        style={isCard ? { borderColor: 'var(--border-color)' } : undefined}
      >
        <DockButton
          label={todo.pinned ? '取消置顶' : '置顶'}
          active={todo.pinned}
          onClick={() => onEdit(todo.id, { pinned: !todo.pinned })}
        >
          <PinIcon size={15} />
        </DockButton>
        <label
          className="relative flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)]"
          title="安排日期"
        >
          <CalendarIcon size={15} />
          <input
            type="date"
            value={todo.plannedDate ?? ''}
            onChange={(event) => onEdit(todo.id, { plannedDate: event.target.value || undefined })}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="安排日期"
          />
        </label>
        <span className="mx-0.5 h-4 w-px" style={{ backgroundColor: 'var(--border-color)' }} />
        <DockButton label="编辑" onClick={openDetail}>
          <EditIcon size={15} />
        </DockButton>
        <DockButton label="归档" danger onClick={() => onDelete(todo.id)}>
          <ArchiveIcon size={15} />
        </DockButton>
        {/* 批量选择：与其它图标同高，但用复选框语义 */}
        {selectable && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
});

export const TodoItem = memo(TodoItemComponent);
