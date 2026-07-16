/**
 * @file HistoryPanel - 历史记录独立弹窗
 * @description 跨项目展示全部归档事项，支持恢复、永久删除、清空全部归档。
 *              从侧边栏「历史记录」入口唤出，与「设置」弹窗完全独立。
 *              弹窗骨架（动画 / 遮罩 / 头部）与 SettingsPanel 保持一致。
 *
 *              数据所有权下沉到本组件：分页按需加载（无限滚动，每页 PAGE_SIZE 条），
 *              首屏仅查 1 页 + 1 次 COUNT。外部归档变动通过订阅 useTodoStore.deletedTodos
 *              引用变化触发 reload（与原 App.tsx memo 的信号链一致）。
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DeletedTodo, Project } from '../../types';
import { XIcon } from '../common/Icons';
import { Logo } from '../common/Logo';
import { ArchiveHistoryView } from './ArchiveHistoryView';
import { useTodoStore } from '../../store/useTodoStore';
import * as db from '../../utils/database';

/** 每页加载条数 */
const PAGE_SIZE = 50;

interface HistoryPanelProps {
  open: boolean;
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
  projects,
  onClose,
  onRestoreTodo,
  onPermanentDeleteTodo,
  onEmptyArchive,
}: HistoryPanelProps) {
  // === 分页数据 state ===
  const [items, setItems] = useState<DeletedTodo[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  /** 下一页的 offset（已加载数量） */
  const offsetRef = useRef(0);
  /** reload 防重入：避免 effect 与回调同时触发造成重复查询/竞态 */
  const reloadingRef = useRef(false);

  // 外部归档变动信号（store 的 deletedTodos 引用在归档/恢复/清空时改变）
  const deletedTodos = useTodoStore((s) => s.deletedTodos);

  /** 重置到第一页并重查总数 */
  const reload = useCallback(() => {
    if (reloadingRef.current) return;
    reloadingRef.current = true;
    try {
      const count = db.getArchivedTodosCount();
      const firstPage = db.getDeletedTodosPaged(PAGE_SIZE, 0);
      offsetRef.current = firstPage.length;
      setItems(firstPage);
      setTotalCount(count);
      setHasMore(firstPage.length < count);
    } finally {
      reloadingRef.current = false;
    }
  }, []);

  /** 加载下一页（由 ArchiveHistoryView 的 IntersectionObserver 触发） */
  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const nextOffset = offsetRef.current;
      const page = db.getDeletedTodosPaged(PAGE_SIZE, nextOffset);
      offsetRef.current = nextOffset + page.length;
      setItems((prev) => [...prev, ...page]);
      // 以「已加载数量 < 总数」判定是否还有更多；page 不足一页时自然收敛
      setHasMore(offsetRef.current < totalCount);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, totalCount]);

  // === 打开时 + 外部归档变动时刷新 ===
  useEffect(() => {
    if (open) reload();
  }, [open, reload, deletedTodos]);

  // === 内部操作包装：执行回调（写 DB + 更新 store）后刷新分页 ===
  // store 更新会改变 deletedTodos 引用从而也触发上方 effect 的 reload；
  // 多查一次 sql.js 本地查询开销可忽略，保持实现简单。
  const handleRestore = useCallback(
    (id: string) => {
      onRestoreTodo(id);
      reload();
    },
    [onRestoreTodo, reload],
  );
  const handlePermanentDelete = useCallback(
    (id: string) => {
      onPermanentDeleteTodo(id);
      reload();
    },
    [onPermanentDeleteTodo, reload],
  );
  const handleEmptyAll = useCallback(() => {
    onEmptyArchive();
    reload();
  }, [onEmptyArchive, reload]);

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
                  className="text-xl font-serif font-semibold leading-none"
                  style={{ color: 'var(--text-primary)' }}
                >
                  历史记录
                  {totalCount > 0 && (
                    <span className="ml-1 font-normal" style={{ color: 'var(--text-tertiary)' }}>
                      · {totalCount}
                    </span>
                  )}
                </h2>
              </div>
              <button onClick={onClose} className="btn-ghost p-1.5" aria-label="关闭" title="关闭">
                <XIcon size={18} />
              </button>
            </div>

            {/* 正文：归档列表视图 */}
            <div className="p-6 pt-4">
              <ArchiveHistoryView
                items={items}
                totalCount={totalCount}
                hasMore={hasMore}
                isLoadingMore={isLoadingMore}
                onLoadMore={handleLoadMore}
                projects={projects}
                onRestore={handleRestore}
                onPermanentDelete={handlePermanentDelete}
                onEmptyAll={handleEmptyAll}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const HistoryPanel = memo(HistoryPanelComponent);
