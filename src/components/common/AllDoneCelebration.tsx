/**
 * @file AllDoneCelebration - 全部完成庆祝卡片
 * @description 当某项目有待办且全部已完成时显示的庆祝区块
 * 设计意图：克制、温暖，与 EmptyState 同源风格，用 --success 强调完成态。
 * 注：撒花动画由调用方（App.tsx）在"刚达成完成"的上升边沿触发，
 *     本组件只负责卡片自身的入场与展示。
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import { CheckIcon } from './Icons';

interface AllDoneCelebrationProps {
  /** 当前项目的已完成事项总数 */
  completed: number;
}

function AllDoneCelebrationComponent({ completed }: AllDoneCelebrationProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col items-center justify-center px-4 py-12 text-center"
    >
      {/* 完成徽标 */}
      <div
        className="relative w-16 h-16 rounded-full flex items-center justify-center mb-5"
        style={{
          backgroundColor: 'var(--accent-subtle)',
          border: '1px solid var(--success)',
        }}
      >
        <CheckIcon size={30} style={{ color: 'var(--success)' }} />
        {/* 轻微脉冲，提示这是"刚达成"的喜悦状态 */}
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ border: '1px solid var(--success)' }}
          initial={{ opacity: 0.5, scale: 1 }}
          animate={{ opacity: 0, scale: 1.35 }}
          transition={{ duration: 1.6, ease: 'easeOut', repeat: 1, repeatDelay: 0.4 }}
        />
      </div>

      <h3
        className="text-xl font-serif mb-2 tracking-tight"
        style={{ color: 'var(--text-primary)' }}
      >
        全部搞定
      </h3>
      <p
        className="text-sm max-w-xs leading-relaxed text-pretty"
        style={{ color: 'var(--text-secondary)' }}
      >
        你完成了这个项目的{' '}
        <span className="font-semibold" style={{ color: 'var(--success)' }}>
          {completed}
        </span>{' '}
        项待办，享受此刻。
      </p>
    </motion.div>
  );
}

export const AllDoneCelebration = memo(AllDoneCelebrationComponent);
