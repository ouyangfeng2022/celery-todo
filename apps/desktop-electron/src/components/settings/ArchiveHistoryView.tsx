/**
 * @file ArchiveHistoryView - 已归档事项视图
 * @description 按项目归类展示归档事项，支持搜索、筛选、恢复与永久删除。
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { DeletedTodo, Project } from '../../types';
import { formatRelativeTime, formatDateTime } from '../../utils/helpers';
import { useSettingsStore } from '../../store/useSettingsStore';
import {
  ChevronDownIcon,
  DownloadIcon,
  FolderIcon,
  InboxIcon,
  SearchIcon,
  TrashIcon,
} from '../common/Icons';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface ArchiveHistoryViewProps {
  items: DeletedTodo[];
  totalCount: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  projects: Project[];
  onRestore: (todo: DeletedTodo) => void;
  onPermanentDelete: (id: string) => void;
  onEmptyAll: () => void;
  onExportHistory: () => void;
}

type ArchiveFilter = 'all' | 'completed' | 'active';

function ArchiveHistoryViewComponent({
  items,
  totalCount,
  hasMore,
  isLoadingMore,
  onLoadMore,
  projects,
  onRestore,
  onPermanentDelete,
  onEmptyAll,
  onExportHistory,
}: ArchiveHistoryViewProps) {
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<DeletedTodo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeletedTodo | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ArchiveFilter>('all');
  const [projectId, setProjectId] = useState('all');
  // 跟随全局时间格式设置（与主列表「创建/完成」时间联动同一开关）
  const timeFormat = useSettingsStore((s) => s.timeFormat);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(isLoadingMore);
  loadingRef.current = isLoadingMore;

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  // 项目筛选下拉框的选项集合：
  //   1) 当前 live 项目（保持侧边栏 sort_order，且若已重命名则用最新名）
  //   2) 已归档、仅存在于 deleted_todos 中的项目（用归档时的 project_name 快照兜底）
  // 直接归档项目后项目已从 projects 删除，必须从 items 补回，否则筛选器找不到该项目。
  // 只覆盖当前已加载分页：极少数情况下分页之外的归档项目要等滚动加载后才出现。
  const filterProjects = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    projects.forEach((project) => {
      map.set(project.id, { id: project.id, name: project.name });
    });
    items.forEach((todo) => {
      if (!map.has(todo.projectId)) {
        map.set(todo.projectId, {
          id: todo.projectId,
          name: todo.projectName ?? '已删除的项目',
        });
      }
    });
    return [...map.values()];
  }, [items, projects]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleItems = useMemo(
    () =>
      items.filter((todo) => {
        const matchesQuery =
          !normalizedQuery ||
          todo.title.toLocaleLowerCase().includes(normalizedQuery) ||
          todo.description?.toLocaleLowerCase().includes(normalizedQuery);
        const matchesStatus =
          status === 'all' || (status === 'completed' ? todo.completed : !todo.completed);
        return (
          matchesQuery && matchesStatus && (projectId === 'all' || todo.projectId === projectId)
        );
      }),
    [items, normalizedQuery, projectId, status],
  );
  const groupedItems = useMemo(() => {
    const groups = new Map<string, DeletedTodo[]>();
    // 直接追加到已有分组，避免同一项目每多一条记录都复制一次整个数组。
    visibleItems.forEach((todo) => {
      const group = groups.get(todo.projectId);
      if (group) {
        group.push(todo);
      } else {
        groups.set(todo.projectId, [todo]);
      }
    });
    return (
      [...groups.entries()]
        .map(([id, todos]) => ({
          id,
          todos,
          project: projectById.get(id),
          // 项目最近一次归档时间：todos 已按 deleted_at DESC，首条即最大值
          latestArchivedAt: todos[0]?.deletedAt ?? '',
        }))
        // 项目间排序：
        //   1) 最近归档时间降序（最近有归档的项目排前面）
        //   2) 时间相同时（批量/清空归档共用一个时间戳），按项目创建时间降序，
        //      新建项目排前面；已删除项目（无 createdAt）兜底排最后。
        // ISO 字符串的字典序 == 时间序，可直接 localeCompare。
        .sort((a, b) => {
          if (a.latestArchivedAt !== b.latestArchivedAt) {
            return b.latestArchivedAt.localeCompare(a.latestArchivedAt);
          }
          const aCreated = a.project?.createdAt ?? '';
          const bCreated = b.project?.createdAt ?? '';
          return bCreated.localeCompare(aCreated);
        })
    );
  }, [projectById, visibleItems]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingRef.current) onLoadMore();
      },
      { root, rootMargin: '160px', threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  const isEmpty = totalCount === 0;
  const hasFilters = Boolean(normalizedQuery) || status !== 'all' || projectId !== 'all';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            已归档的事项会保存在这里，可随时恢复或永久删除。
          </p>
          {totalCount > 0 && (
            <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              共 {totalCount} 项归档事项
            </p>
          )}
        </div>
        {totalCount > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={onExportHistory}
              className="btn-ghost flex items-center gap-1.5 text-sm"
              title="导出全部归档为 JSON 快照"
            >
              <DownloadIcon size={14} />
              导出
            </button>
            <button
              onClick={() => setConfirmEmpty(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--danger) 10%, transparent)',
                color: 'var(--danger)',
              }}
            >
              <TrashIcon size={14} />
              全部删除
            </button>
          </div>
        )}
      </div>

      {!isEmpty && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <SearchIcon
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
              size={16}
              style={{ color: 'var(--text-tertiary)' }}
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索已归档事项"
              className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-[var(--accent)]"
              style={{
                borderColor: 'var(--border-color)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
              }}
            />
          </label>
          <label className="relative">
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as ArchiveFilter)}
              className="h-full min-h-10 appearance-none rounded-lg border bg-transparent py-2 pl-3 pr-9 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              <option value="all">所有事项</option>
              <option value="active">未完成事项</option>
              <option value="completed">已完成事项</option>
            </select>
            <ChevronDownIcon
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
              size={14}
              style={{ color: 'var(--text-tertiary)' }}
            />
          </label>
          <label className="relative">
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="h-full min-h-10 appearance-none rounded-lg border bg-transparent py-2 pl-3 pr-9 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              <option value="all">所有项目</option>
              {filterProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <ChevronDownIcon
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
              size={14}
              style={{ color: 'var(--text-tertiary)' }}
            />
          </label>
        </div>
      )}

      {isEmpty ? (
        <div
          className="flex flex-col items-center justify-center rounded-xl border py-16 text-center"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <span
            className="mb-3 flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-quaternary)' }}
          >
            <InboxIcon size={22} />
          </span>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            暂无已归档事项
          </p>
        </div>
      ) : (
        <div ref={scrollContainerRef} className="max-h-[55vh] space-y-7 overflow-y-auto pr-1">
          {groupedItems.map(({ id, project, todos }) => (
            <section key={id}>
              <div className="mb-2.5 flex items-center justify-between px-0.5">
                <div
                  className="flex min-w-0 items-center gap-2 text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <FolderIcon
                    size={16}
                    style={{ color: project?.color ?? 'var(--text-tertiary)' }}
                  />
                  <span className="truncate">
                    {project?.name ?? todos[0]?.projectName ?? '已删除的项目'}
                  </span>
                </div>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {todos.length} 个事项
                </span>
              </div>
              <div
                className="overflow-hidden rounded-xl border"
                style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}
              >
                {todos.map((todo, index) => (
                  <div
                    key={todo.id}
                    className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-secondary)]"
                    style={{ borderTop: index === 0 ? undefined : '1px solid var(--border-color)' }}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-sm font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {todo.title}
                      </p>
                      <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        归档于{' '}
                        {timeFormat === 'exact'
                          ? formatDateTime(todo.deletedAt)
                          : formatRelativeTime(todo.deletedAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => setDeleteTarget(todo)}
                        className="rounded-md p-1.5 opacity-0 transition-all hover:bg-[var(--bg-tertiary)] group-hover:opacity-100 focus:opacity-100"
                        style={{ color: 'var(--text-tertiary)' }}
                        aria-label={`永久删除 ${todo.title}`}
                        title="永久删除"
                      >
                        <TrashIcon size={15} />
                      </button>
                      <button
                        onClick={() => setRestoreTarget(todo)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors hover:opacity-80"
                        style={{
                          backgroundColor: 'var(--bg-tertiary)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        取消归档
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {hasFilters && visibleItems.length === 0 && (
            <p className="py-12 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
              没有符合条件的已归档事项
            </p>
          )}
          {hasMore && (
            <div ref={sentinelRef} className="py-3 text-center">
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {isLoadingMore ? '加载中…' : '向下滚动加载更多'}
              </span>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmEmpty}
        title="删除全部归档事项"
        message="此操作将永久删除所有已归档事项，无法恢复。确定继续吗？"
        confirmText="全部删除"
        danger
        onConfirm={() => {
          onEmptyAll();
          setConfirmEmpty(false);
        }}
        onCancel={() => setConfirmEmpty(false)}
      />
      <ConfirmDialog
        open={restoreTarget !== null}
        title="取消归档"
        message={`确定要取消归档「${restoreTarget?.title}」吗？该事项将回到原属项目。`}
        confirmText="取消归档"
        onConfirm={() => {
          if (restoreTarget) onRestore(restoreTarget);
          setRestoreTarget(null);
        }}
        onCancel={() => setRestoreTarget(null)}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title="永久删除"
        message={`此操作将永久删除「${deleteTarget?.title}」，无法恢复。确定继续吗？`}
        confirmText="永久删除"
        danger
        onConfirm={() => {
          if (deleteTarget) onPermanentDelete(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export const ArchiveHistoryView = memo(ArchiveHistoryViewComponent);
