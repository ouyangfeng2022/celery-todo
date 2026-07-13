/**
 * @file FilterBar - 筛选与排序工具栏
 * @description 提供全部/进行中/已完成筛选、排序方式选择、归档已完成
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import type { FilterType, SortType } from '../../types';
import { SORT_LABELS } from '../../types';
import { ArchiveIcon } from '../common/Icons';

interface FilterBarProps {
  filter: FilterType;
  sort: SortType;
  activeCount: number;
  completedCount: number;
  onFilterChange: (filter: FilterType) => void;
  onSortChange: (sort: SortType) => void;
  onClearCompleted: () => void;
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
  onFilterChange,
  onSortChange,
  onClearCompleted,
}: FilterBarProps) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
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
              className="relative px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors"
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
                <span
                  className="text-[11px] px-1.5 py-0.5 rounded-full tabular-nums font-medium"
                  style={{
                    backgroundColor: isActive ? 'var(--accent-subtle)' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text-tertiary)',
                  }}
                >
                  {count}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* 右侧操作 */}
      <div className="flex items-center gap-2">
        {/* 排序选择 */}
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortType)}
          className="text-[13px] px-2.5 py-1.5 rounded-md border-none cursor-pointer transition-colors"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
          }}
          aria-label="排序方式"
        >
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        {/* 归档已完成 */}
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
    </div>
  );
}

export const FilterBar = memo(FilterBarComponent);
