/**
 * @file useFilter - 筛选与排序 Hook
 * @description 管理筛选视图、排序方式、搜索关键词。
 * 排序方式与状态筛选按项目独立持久化（settings 表 `filter.<projectId>` /
 * `sort.<projectId>`），切换项目时各自回到该项目的上次选择；搜索词是临时
 * 查找操作，不持久化，切换项目时清空，避免跨项目残留。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Todo, FilterType, SortType } from '../types';
import * as db from '../utils/database';

/** URL 参数键（仅用于搜索词的 web 端 reload 恢复） */
const SEARCH_PARAM = 'q';

/** 默认值 */
const DEFAULT_FILTER: FilterType = 'all';
const DEFAULT_SORT: SortType = 'created-desc';

/** 合法值白名单（防 settings 表脏值导致 UI 异常） */
const FILTER_VALUES: readonly FilterType[] = ['all', 'active', 'completed'];
const SORT_VALUES: readonly SortType[] = ['created-asc', 'created-desc', 'priority', 'manual'];

/** per-project settings 命名键 */
const filterKey = (pid: string) => `filter.${pid}`;
const sortKey = (pid: string) => `sort.${pid}`;

/** 从 settings 表读取该项目持久化的筛选值（无值或脏值回退默认） */
function readFilter(pid: string): FilterType {
  const v = db.getSetting(filterKey(pid));
  return v && (FILTER_VALUES as readonly string[]).includes(v) ? (v as FilterType) : DEFAULT_FILTER;
}

/** 从 settings 表读取该项目持久化的排序值（无值或脏值回退默认） */
function readSort(pid: string): SortType {
  const v = db.getSetting(sortKey(pid));
  return v && (SORT_VALUES as readonly string[]).includes(v) ? (v as SortType) : DEFAULT_SORT;
}

/** 优先级排序权重 */
const PRIORITY_WEIGHT: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export function useFilter(todos: Todo[], projectId: string) {
  // 初值用默认值兜底；projectId 生效后由下面的 effect 从 settings 读取覆盖。
  const [filter, setFilter] = useState<FilterType>(DEFAULT_FILTER);
  const [sort, setSort] = useState<SortType>(DEFAULT_SORT);
  // 搜索词仅支持 URL 冷启动恢复（web 端 reload 场景），桌面端始终从空串开始。
  const [search, setSearch] = useState<string>(
    () => new URLSearchParams(window.location.search).get(SEARCH_PARAM) ?? '',
  );

  // 切换项目（含首次 mount projectId 就绪）：从 settings 读取该项目的
  // 排序/筛选偏好，并清空搜索词。projectId 为空串（首启动尚未选定项目）
  // 时跳过，避免误读/误写到 `filter.` 这种无意义键。
  useEffect(() => {
    if (!projectId) return;
    setFilter(readFilter(projectId));
    setSort(readSort(projectId));
    setSearch('');
  }, [projectId]);

  // 同步搜索词到 URL（仅 web 端 reload 可见，桌面端无意义但保持兼容）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (search) params.set(SEARCH_PARAM, search);
    else params.delete(SEARCH_PARAM);
    const qs = params.toString();
    const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    window.history.replaceState({}, '', newUrl);
  }, [search]);

  // 监听浏览器前进/后退：只回填搜索词（filter/sort 由 projectId effect 管控）
  useEffect(() => {
    const handlePopState = () => {
      const v = new URLSearchParams(window.location.search).get(SEARCH_PARAM) ?? '';
      setSearch(v);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  /** 筛选后的 Todo 列表 */
  const filteredTodos = useMemo(() => {
    let result = [...todos];

    // 1. 搜索过滤
    if (search.trim()) {
      const lower = search.trim().toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(lower) ||
          (t.description?.toLowerCase().includes(lower) ?? false),
      );
    }

    // 2. 状态筛选
    switch (filter) {
      case 'active':
        result = result.filter((t) => !t.completed);
        break;
      case 'completed':
        result = result.filter((t) => t.completed);
        break;
      default:
        break;
    }

    // 3. 排序：置顶项始终浮在最前，置顶组与非置顶组各自再按当前排序规则排。
    //    先按 pinned 分两组，对每组分别排序后拼接，保证置顶稳定居顶。
    const applySort = (arr: Todo[]) => {
      switch (sort) {
        case 'created-asc':
          arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          break;
        case 'created-desc':
          arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          break;
        case 'priority':
          arr.sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]);
          break;
        case 'manual':
          arr.sort((a, b) => a.order - b.order);
          break;
      }
    };
    const pinned = result.filter((t) => t.pinned);
    const unpinned = result.filter((t) => !t.pinned);
    applySort(pinned);
    applySort(unpinned);
    result = [...pinned, ...unpinned];

    return result;
  }, [todos, filter, sort, search]);

  /** 统计信息 */
  const stats = useMemo(() => {
    const total = todos.length;
    const completed = todos.filter((t) => t.completed).length;
    const active = total - completed;
    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
    return { total, completed, active, percentage };
  }, [todos]);

  const changeFilter = useCallback(
    (f: FilterType) => {
      setFilter(f);
      if (projectId) db.setSetting(filterKey(projectId), f);
    },
    [projectId],
  );
  const changeSort = useCallback(
    (s: SortType) => {
      setSort(s);
      if (projectId) db.setSetting(sortKey(projectId), s);
    },
    [projectId],
  );
  const changeSearch = useCallback((q: string) => setSearch(q), []);

  return {
    filter,
    sort,
    search,
    filteredTodos,
    stats,
    changeFilter,
    changeSort,
    changeSearch,
  };
}
