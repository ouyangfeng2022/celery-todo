/**
 * @file EmptyState - 空状态占位组件
 * @description 当没有事项时显示友好的提示。按当前 filter 分支：
 *   - `completed` 且项目非空（有 todo 但都未完成）→「尚无果实可摘」
 *   - `active` 且项目非空（项目全部已完成）→「没有进行中的事项」
 *     （allDone 庆祝卡只在「全部」分类显示，进行中分类会走到这里）
 *   - 其它 →「从一件小事开始」（含 all filter 真空白、completed filter 但项目真空）
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import { SparkleIcon } from '../common/Icons';
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
  // 进行中 filter + 项目全已完成：引导去看已完成列表
  const isActiveAllDone = filter === 'active' && hasTodos;

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
        {isActiveAllDone
          ? '没有进行中的事项'
          : isCompletedEmpty
            ? '尚无果实可摘'
            : '从一件小事开始'}
      </h3>
      <p
        className="text-sm max-w-xs leading-relaxed text-pretty"
        style={{ color: 'var(--text-secondary)' }}
      >
        {isActiveAllDone
          ? '该项目的事项都已完成，切换到「已完成」可以回看它们。'
          : isCompletedEmpty
            ? '完成一项待办后，它会落在这里供你回望。'
            : '在上方输入框写下你的第一个待办。 用逗号或分号分隔，可以一次添加多项。'}
      </p>

      {/* Ctrl+N 快捷键提示仅对「新建」语义的空态有意义；completed/active 空态的
          诉求是回看既有事项而非新建，提示新建会误导，故隐藏。 */}
      {!isCompletedEmpty && !isActiveAllDone && (
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
