/**
 * @file HistorySection - 设置页「已归档事项」子页面
 * @description 跨项目展示全部归档事项，支持恢复、永久删除、清空全部归档。
 *              归档永久保留，不自动清除——唯一删除途径是本视图的手动操作。
 *
 *              数据所有权下沉到本组件：分页按需加载（无限滚动，每页 PAGE_SIZE 条），
 *              首屏仅查 1 页 + 1 次 COUNT。外部归档变动通过订阅 useTodoStore.deletedTodos
 *              引用变化触发 reload（与原 HistoryPanel 的信号链一致）。
 *              列表渲染 + 无限滚动哨兵由子组件 ArchiveHistoryView 承担。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeletedTodo, Project } from '../../../types';
import { ArchiveHistoryView } from '../ArchiveHistoryView';
import { useTodoStore } from '../../../store/useTodoStore';
import * as db from '../../../utils/database';

/** 每页加载条数 */
const PAGE_SIZE = 50;

interface HistorySectionProps {
  /** 全部项目（历史记录页解析项目名标签） */
  projects: Project[];
  /** 恢复归档事项 */
  onRestoreTodo: (id: string) => void;
  /** 永久删除归档事项 */
  onPermanentDeleteTodo: (id: string) => void;
  /** 清空全部归档 */
  onEmptyArchive: () => void;
  /** 导出全量归档为 JSON 快照（只读，不可导回） */
  onExportHistory: () => void;
}

export function HistorySection({
  projects,
  onRestoreTodo,
  onPermanentDeleteTodo,
  onEmptyArchive,
  onExportHistory,
}: HistorySectionProps) {
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

  // === 挂载时 + 外部归档变动时刷新 ===
  useEffect(() => {
    reload();
  }, [reload, deletedTodos]);

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
    <section>
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
        onExportHistory={onExportHistory}
      />
    </section>
  );
}
