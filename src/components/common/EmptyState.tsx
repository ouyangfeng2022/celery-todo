/**
 * @file EmptyState - 空状态占位组件
 * @description 当没有事项时显示友好的提示
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import { SparkleIcon } from '../common/Icons';

function EmptyStateComponent() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center py-16 px-4 text-center"
    >
      {/* 装饰性图标 */}
      <div
        className="relative w-20 h-20 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: 'var(--accent-light)' }}
      >
        <motion.div
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <SparkleIcon size={36} style={{ color: 'var(--accent)' }} />
        </motion.div>
      </div>

      <h3 className="text-xl font-serif mb-2" style={{ color: 'var(--text-primary)' }}>
        还没有事项
      </h3>
      <p className="text-sm max-w-xs" style={{ color: 'var(--text-secondary)' }}>
        在上方输入框中添加你的第一个待办事项。
        支持用逗号或分号分隔，一次添加多个事项。
      </p>

      <div
        className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <kbd className="px-2 py-1 rounded border" style={{ borderColor: 'var(--border-strong)' }}>
          Ctrl + N
        </kbd>
        <span>快速新建</span>
      </div>
    </motion.div>
  );
}

export const EmptyState = memo(EmptyStateComponent);
