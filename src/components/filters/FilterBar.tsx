/**
 * @file FilterBar - 筛选与排序工具栏
 * @description 提供全部/进行中/已完成筛选、排序方式选择、归档已完成
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import type { FilterType, SortType } from '../../types';
import { MANUAL_SORT_LABEL, SORT_LABELS } from '../../types';
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
                    className="text-[13px] leading-none px-2 py-0.5 rounded-full tabular-nums font-bold min-w-[22px] text-center"
                    style={{
                      backgroundColor: isActive ? 'var(--accent-subtle)' : 'var(--bg-hover)',
                      color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    {count}
                  </span>
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

      {/* 右侧：排序选择（外层 flex 直接子元素，由 justify-between 钉在最右，不随归档按钮出现/消失而跳动） */}
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
        {/* 「手动排序」仅作为只读指示项出现：用户无法主动选中它，
            仅当 sort 已为 manual（由拖拽触发）时才在下拉框中渲染，
            让用户感知「当前为自定义顺序」，再选其它项即可退出。 */}
        {sort === 'manual' && <option value="manual">{MANUAL_SORT_LABEL}</option>}
        {Object.entries(SORT_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

export const FilterBar = memo(FilterBarComponent);
