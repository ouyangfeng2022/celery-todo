/**
 * @file EmptyState - 空状态占位组件
 * @description 当没有事项时显示友好的提示。按当前 filter 分支：
 *   - `completed` 且项目非空（有 todo 但都未完成）→「尚无果实可摘」
 *   - 其它（含 all filter 真空白、completed filter 但项目真空回退）→「从一件小事开始」
 *   注：active filter 的空态由 App.tsx 的 allDone 优先拦截成 AllDoneCelebration，
 *       实际不会到达本组件，故此处不为 active 单独分支。
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import { SparkleIcon, InboxIcon } from '../common/Icons';
import type { FilterType } from '../../types';

interface EmptyStateProps {
  /** 当前筛选类型，决定空态文案分支 */
  filter?: FilterType;
  /** 项目本身是否含有任何 todo（区分「项目真空」与「当前 filter 筛不到」） */
  hasTodos?: boolean;
}

function EmptyStateComponent({ filter = 'all', hasTodos = false }: EmptyStateProps) {
  // 已完成 filter + 项目非空：项目里有 todo 但都未完成，引导用户去完成一项
  const isCompletedEmpty = filter === 'completed' && hasTodos;

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
        {isCompletedEmpty ? (
          <InboxIcon size={28} style={{ color: 'var(--accent)' }} />
        ) : (
          <SparkleIcon size={28} style={{ color: 'var(--accent)' }} />
        )}
      </div>

      <h3
        className="text-xl font-serif mb-2 tracking-tight"
        style={{ color: 'var(--text-primary)' }}
      >
        {isCompletedEmpty ? '尚无果实可摘' : '从一件小事开始'}
      </h3>
      <p
        className="text-sm max-w-xs leading-relaxed text-pretty"
        style={{ color: 'var(--text-secondary)' }}
      >
        {isCompletedEmpty
          ? '完成一项待办后，它会落在这里供你回望。'
          : '在上方输入框写下你的第一个待办。 用逗号或分号分隔，可以一次添加多项。'}
      </p>

      {/* Ctrl+N 快捷键提示仅对「新建」语义的空态有意义；completed 空态诉求是
          「去完成一项」，提示新建会误导，故隐藏。 */}
      {!isCompletedEmpty && (
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
      )}
    </motion.div>
  );
}

export const EmptyState = memo(EmptyStateComponent);
