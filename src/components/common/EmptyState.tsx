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
      className="flex flex-col items-center justify-center py-20 px-4 text-center"
    >
      {/* 装饰性图标 - 极简的轮廓，不喧哗 */}
      <div
        className="relative w-16 h-16 rounded-full flex items-center justify-center mb-5"
        style={{
          backgroundColor: 'var(--accent-subtle)',
          border: '1px solid var(--border-color)',
        }}
      >
        <SparkleIcon size={28} style={{ color: 'var(--accent)' }} />
      </div>

      <h3
        className="text-xl font-serif mb-2 tracking-tight"
        style={{ color: 'var(--text-primary)' }}
      >
        从一件小事开始
      </h3>
      <p
        className="text-sm max-w-xs leading-relaxed text-pretty"
        style={{ color: 'var(--text-secondary)' }}
      >
        在上方输入框写下你的第一个待办。
        用逗号或分号分隔，可以一次添加多项。
      </p>

      <div
        className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <kbd
          className="px-2 py-1 rounded border font-mono text-[11px]"
          style={{ borderColor: 'var(--border-strong)' }}
        >
          Ctrl + N
        </kbd>
        <span>快速新建</span>
      </div>
    </motion.div>
  );
}

export const EmptyState = memo(EmptyStateComponent);
