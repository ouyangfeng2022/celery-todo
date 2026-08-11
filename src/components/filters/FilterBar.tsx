/**
 * @file FilterBar - 筛选与排序工具栏
 * @description 提供全部/进行中/已完成筛选、排序方式选择、归档已完成
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import type { FilterType, SortType, TodoViewMode } from '../../types';
import { SORT_LABELS } from '../../types';
import { CountBadge } from '../common/CountBadge';
import { ArchiveIcon, BoardIcon, ListIcon } from '../common/Icons';

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
                    className="min-w-[22px] px-2 text-[13px] font-bold"
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
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortType)}
          className="cursor-pointer rounded-md border-none px-2.5 py-1.5 text-[13px] transition-colors"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
          }}
          aria-label="排序方式"
        >
          {/* 拖拽后的自定义顺序只能由拖拽产生，不作为可主动选择的排序规则；
              但仍准确展示当前状态，避免把“排序方式”占位误认为默认选项。 */}
          {sort === 'manual' && (
            <option value="manual" disabled>
              自定义顺序
            </option>
          )}
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

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
