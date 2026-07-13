/**
 * @file HistoryPanel - 历史记录独立弹窗
 * @description 跨项目展示全部归档事项，支持恢复、永久删除、清空全部归档。
 *              从侧边栏「历史记录」入口唤出，与「设置」弹窗完全独立。
 *              弹窗骨架（动画 / 遮罩 / 头部）与 SettingsPanel 保持一致。
 */

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DeletedTodo, Project } from '../../types';
import { XIcon } from '../common/Icons';
import { Logo } from '../common/Logo';
import { ArchiveHistoryView } from './ArchiveHistoryView';

interface HistoryPanelProps {
  open: boolean;
  /** 全部归档事项（跨项目） */
  archivedTodos: DeletedTodo[];
  /** 全部项目（历史记录页解析项目名标签） */
  projects: Project[];
  onClose: () => void;
  /** 恢复归档事项 */
  onRestoreTodo: (id: string) => void;
  /** 永久删除归档事项 */
  onPermanentDeleteTodo: (id: string) => void;
  /** 清空全部归档 */
  onEmptyArchive: () => void;
}

function HistoryPanelComponent({
  open,
  archivedTodos,
  projects,
  onClose,
  onRestoreTodo,
  onPermanentDeleteTodo,
  onEmptyArchive,
}: HistoryPanelProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(47, 45, 39, 0.4)' }}
            onClick={onClose}
          />

          <motion.div
            className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-claude"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-lg)',
            }}
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* 头部 */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b sticky top-0 z-10"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                borderColor: 'var(--border-color)',
              }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Logo size={26} className="flex-shrink-0" />
                <h2
                  className="text-xl font-serif tracking-tight"
                  style={{ color: 'var(--text-primary)' }}
                >
                  历史记录
                </h2>
              </div>
              <button onClick={onClose} className="btn-ghost p-1.5" aria-label="关闭">
                <XIcon size={18} />
              </button>
            </div>

            {/* 正文：归档列表视图 */}
            <div className="p-6 pt-4">
              <ArchiveHistoryView
                archivedTodos={archivedTodos}
                projects={projects}
                onRestore={onRestoreTodo}
                onPermanentDelete={onPermanentDeleteTodo}
                onEmptyAll={onEmptyArchive}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const HistoryPanel = memo(HistoryPanelComponent);
