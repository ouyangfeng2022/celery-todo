/**
 * @file StatsPanel - 统计信息面板
 * @description 显示剩余事项数、总数、完成百分比进度条
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
  return (
    <div className="claude-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            剩余 <span className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>{active}</span> 项待完成
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            共 {total} 项 · 已完成 {completed} 项
            {overdue > 0 && (
              <span style={{ color: 'var(--danger)' }}> · {overdue} 项已过期</span>
            )}
          </p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-serif" style={{ color: 'var(--accent)' }}>
            {percentage}%
          </span>
        </div>
      </div>

      {/* 进度条 */}
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{
            background: 'linear-gradient(90deg, var(--accent), var(--accent-hover))',
          }}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

export const StatsPanel = memo(StatsPanelComponent);
