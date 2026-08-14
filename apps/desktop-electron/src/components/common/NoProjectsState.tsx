/**
 * @file NoProjectsState - 无项目时的主区引导
 * @description 当项目列表为空时，引导用户创建第一个项目（区别于「无待办」的 EmptyState）
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import { FolderPlusIcon } from '../common/Icons';

interface NoProjectsStateProps {
  /** 点击「新建项目」按钮：唤起侧边栏新建输入框 */
  onCreate: () => void;
}

function NoProjectsStateComponent({ onCreate }: NoProjectsStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center py-20 px-4 text-center"
    >
      <div
        className="relative w-16 h-16 rounded-full flex items-center justify-center mb-5"
        style={{
          backgroundColor: 'var(--accent-subtle)',
          border: '1px solid var(--border-color)',
        }}
      >
        <FolderPlusIcon size={28} style={{ color: 'var(--accent)' }} />
      </div>

      <h3
        className="text-xl font-serif mb-2 tracking-tight"
        style={{ color: 'var(--text-primary)' }}
      >
        还没有项目
      </h3>
      <p
        className="text-sm max-w-xs leading-relaxed text-pretty"
        style={{ color: 'var(--text-secondary)' }}
      >
        创建你的第一个项目，开始管理待办事项。
      </p>

      <button
        onClick={onCreate}
        className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors"
        style={{
          backgroundColor: 'var(--accent)',
          color: 'white',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.9';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '1';
        }}
      >
        <FolderPlusIcon size={16} />
        创建第一个项目
      </button>
    </motion.div>
  );
}

export const NoProjectsState = memo(NoProjectsStateComponent);
