/**
 * @file StatsPanel - 统计信息面板
 * @description 显示剩余事项数、总数、完成百分比进度条
 * 设计意图：扁平、克制、把进度作为唯一的视觉焦点。
 */

import { memo } from 'react';
import { motion } from 'framer-motion';

interface StatsPanelProps {
  total: number;
  completed: number;
  active: number;
  overdue: number;
  percentage: number;
}

function StatsPanelComponent({ total, completed, active, overdue, percentage }: StatsPanelProps) {
  // 空列表时不渲染，避免空的卡片占位
  if (total === 0) return null;

  return (
    <div className="px-1 py-2">
      {/* 进度条 - 主视觉 */}
      <div className="flex items-center justify-between mb-2">
        <p
          className="text-sm flex items-baseline gap-1.5"
          style={{ color: 'var(--text-secondary)' }}
        >
          {active === 0 ? (
            <span style={{ color: 'var(--success)' }}>全部完成 · 享受此刻</span>
          ) : (
            <>
              <span>还有</span>
              <span
                className="font-serif tabular-nums leading-none select-none"
                style={{
                  fontSize: '28px',
                  fontWeight: 700,
                  color: 'var(--accent)',
                  letterSpacing: '-0.02em',
                  fontFeatureSettings: '"lnum"',
                }}
              >
                {active}
              </span>
              <span>项待完成</span>
            </>
          )}
        </p>
        <span
          className="text-sm font-medium tabular-nums"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {completed} / {total}
        </span>
      </div>

      <div
        className="h-1 rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--bg-hover)' }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: 'var(--accent)' }}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        />
      </div>

      {overdue > 0 && (
        <p className="text-xs mt-2 flex items-center gap-1" style={{ color: 'var(--danger)' }}>
          <span
            className="inline-block w-1 h-1 rounded-full"
            style={{ backgroundColor: 'var(--danger)' }}
          />
          {overdue} 项已过期
        </p>
      )}
    </div>
  );
}

export const StatsPanel = memo(StatsPanelComponent);
