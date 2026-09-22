/**
 * @file FilterBar - 筛选与排序工具栏
 * @description 提供全部/进行中/已完成筛选、排序方式选择、归档已完成。
 * 排序用自绘下拉（原生 select 无法感知「再次选择同一项」）：
 * 点击非当前方式 → 切换到该方式（默认倒序）；再次点击当前方式 → 切换正序/倒序。
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { FilterType, SortDirection, SortField, SortType, TodoViewMode } from '../../types';
import { SORT_FIELD_LABELS } from '../../types';
import { sortDirectionOf, sortFieldOf, toggleSortDirection } from '../../utils/sortTodos';
import { useDismissibleLayer } from '../../hooks/useDismissibleLayer';
import { CountBadge } from '../common/CountBadge';
import { ArchiveIcon, BoardIcon, ChevronDownIcon, ListIcon } from '../common/Icons';

interface FilterBarProps {
  filter: FilterType;
  sort: SortType;
  activeCount: number;
  completedCount: number;
  viewMode: TodoViewMode;
  onFilterChange: (filter: FilterType) => void;
  onSortChange: (sort: SortType) => void;
  onClearCompleted: () => void;
  onViewModeChange: (mode: TodoViewMode) => void;
}

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '进行中' },
  { value: 'completed', label: '已完成' },
];

/** 方向箭头：desc=倒序（↓），asc=正序（↑） */
function DirectionArrow({ direction }: { direction: SortDirection }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {direction === 'desc' ? (
        <path
          d="M6 1.5v8M2.8 6.7 6 9.9l3.2-3.2"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M6 10.5v-8M2.8 5.3 6 2.1l3.2 3.2"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/**
 * 排序方式下拉。菜单锚定到按钮左下角（右对齐按钮右缘，避免贴窗口右缘溢出），
 * 经 portal 渲染到 document.body；外部点击 / Escape 由 useDismissibleLayer 关闭，
 * 滚动 / resize 使缓存坐标失效时直接关闭（与 Header 浮层同一套约定）。
 */
function SortMenu({ sort, onSortChange }: { sort: SortType; onSortChange: (s: SortType) => void }) {
  const [open, setOpen] = useState(false);
  // 打开时一次性测量的锚定坐标（viewport 坐标，portal + fixed 定位用）
  const [pos, setPos] = useState<{ right: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useDismissibleLayer(open, [buttonRef, menuRef], () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  const openMenu = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPos({ right: window.innerWidth - rect.right, top: rect.bottom + 4 });
    setOpen(true);
  }, []);

  const currentField = sortFieldOf(sort);
  const currentDirection = sortDirectionOf(sort);
  // manual（拖拽产生的自定义顺序）只能展示、不能主动选回；按钮不显示方向箭头
  const buttonLabel = currentField ? SORT_FIELD_LABELS[currentField] : '自定义顺序';

  const handleSelect = (field: SortField) => {
    if (field === currentField) {
      // 再次选择当前方式 = 切换正序/倒序；菜单保持打开，让箭头翻转可见
      onSortChange(toggleSortDirection(sort));
    } else {
      // 选择其它方式 = 切过去并回到该方式的倒序默认
      onSortChange(field === 'created' ? 'created-desc' : 'priority-desc');
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="cursor-pointer rounded-md border-none px-2.5 py-1.5 text-[13px] transition-colors flex items-center gap-1"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-secondary)',
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`排序方式：${buttonLabel}`}
      >
        <span>{buttonLabel}</span>
        {currentField && (
          <span style={{ display: 'flex', color: 'var(--text-tertiary)' }}>
            <DirectionArrow direction={currentDirection} />
          </span>
        )}
        <span style={{ display: 'flex', color: 'var(--text-tertiary)' }}>
          <ChevronDownIcon size={12} />
        </span>
      </button>

      {createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={menuRef}
              role="menu"
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
              className="fixed z-[60] min-w-[10.5rem] py-1 rounded-xl"
              style={{
                right: pos.right,
                top: pos.top,
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              {(Object.keys(SORT_FIELD_LABELS) as SortField[]).map((field) => {
                const active = field === currentField;
                return (
                  <button
                    key={field}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => handleSelect(field)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                  >
                    <span className="flex-1">{SORT_FIELD_LABELS[field]}</span>
                    {active && (
                      <span style={{ display: 'flex', color: 'var(--text-tertiary)' }}>
                        <DirectionArrow direction={currentDirection} />
                      </span>
                    )}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

function FilterBarComponent({
  filter,
  sort,
  activeCount,
  completedCount,
  viewMode,
  onFilterChange,
  onSortChange,
  onClearCompleted,
  onViewModeChange,
}: FilterBarProps) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      {/* 左侧：筛选 + 归档（归档紧贴筛选区，与"已完成"语义成组） */}
      <div className="flex items-center gap-2">
        {/* 筛选标签 - segmented control */}
        <div
          className="flex items-center gap-0.5 p-0.5 rounded-lg"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          {FILTER_OPTIONS.map((option) => {
            const count =
              option.value === 'all'
                ? activeCount + completedCount
                : option.value === 'active'
                  ? activeCount
                  : completedCount;
            const isActive = filter === option.value;
            return (
              <button
                key={option.value}
                onClick={() => onFilterChange(option.value)}
                className="relative px-3 py-1.5 text-[13px] font-semibold rounded-md transition-colors"
                style={{
                  color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                }}
              >
                {isActive && (
                  <motion.div
                    layoutId="filter-pill"
                    className="absolute inset-0 rounded-md"
                    style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      boxShadow: 'var(--shadow-xs)',
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  {option.label}
                  <CountBadge
                    variant={isActive ? 'accent' : 'muted'}
                    className="min-w-[calc(2ch+1rem)] px-2 text-[13px] font-bold"
                  >
                    {count}
                  </CountBadge>
                </span>
              </button>
            );
          })}
        </div>

        {/* 归档已完成 - 紧贴筛选区 */}
        {completedCount > 0 && (
          <button
            onClick={onClearCompleted}
            className="btn-ghost text-[13px] flex items-center gap-1.5"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <ArchiveIcon size={13} />
            归档已完成
          </button>
        )}
      </div>

      {/* 右侧：排序与显示方式成组，避免切换卡片后找不到返回列表的入口。 */}
      <div className="flex items-center gap-2">
        <SortMenu sort={sort} onSortChange={onSortChange} />

        <div
          className="flex items-center gap-0.5 rounded-lg p-0.5"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
          aria-label="事项显示方式"
        >
          {(
            [
              ['list', '列表视图', ListIcon],
              ['card', '卡片视图', BoardIcon],
            ] as const
          ).map(([mode, label, Icon]) => {
            const isActive = viewMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onViewModeChange(mode)}
                className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                style={{
                  color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  backgroundColor: isActive ? 'var(--bg-tertiary)' : 'transparent',
                  boxShadow: isActive ? 'var(--shadow-xs)' : 'none',
                }}
                aria-label={label}
                aria-pressed={isActive}
                title={label}
              >
                <Icon size={14} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export const FilterBar = memo(FilterBarComponent);
