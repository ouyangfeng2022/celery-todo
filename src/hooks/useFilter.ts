/**
 * @file useFilter - 筛选与排序 Hook
 * @description 管理筛选视图、排序方式、搜索关键词，并将筛选状态同步到 URL 参数
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Todo, FilterType, SortType } from '../types';
import { isOverdue } from '../utils/helpers';

/** URL 参数键 */
const FILTER_PARAM = 'filter';
const SORT_PARAM = 'sort';
const SEARCH_PARAM = 'q';

/** 从 URL 读取筛选状态 */
function readFromUrl(): { filter: FilterType; sort: SortType; search: string } {
  const params = new URLSearchParams(window.location.search);
  const filter = (params.get(FILTER_PARAM) as FilterType) || 'all';
  const sort = (params.get(SORT_PARAM) as SortType) || 'created-desc';
  const search = params.get(SEARCH_PARAM) || '';
  return { filter, sort, search };
}

/** 将筛选状态写入 URL */
function writeToUrl(filter: FilterType, sort: SortType, search: string): void {
  const params = new URLSearchParams();
  if (filter !== 'all') params.set(FILTER_PARAM, filter);
  if (sort !== 'created-desc') params.set(SORT_PARAM, sort);
  if (search) params.set(SEARCH_PARAM, search);

  const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
  window.history.replaceState({}, '', newUrl);
}

/** 优先级排序权重 */
const PRIORITY_WEIGHT: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export function useFilter(todos: Todo[]) {
  const initial = readFromUrl();
  const [filter, setFilter] = useState<FilterType>(initial.filter);
  const [sort, setSort] = useState<SortType>(initial.sort);
  const [search, setSearch] = useState<string>(initial.search);

  // 同步到 URL
  useEffect(() => {
    writeToUrl(filter, sort, search);
  }, [filter, sort, search]);

  // 监听浏览器前进/后退
  useEffect(() => {
    const handlePopState = () => {
      const state = readFromUrl();
      setFilter(state.filter);
      setSort(state.sort);
      setSearch(state.search);
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

    // 3. 排序
    switch (sort) {
      case 'created-asc':
        result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        break;
      case 'created-desc':
        result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
      case 'due-date':
        result.sort((a, b) => {
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.localeCompare(b.dueDate);
        });
        break;
      case 'priority':
        result.sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]);
        break;
      case 'manual':
        result.sort((a, b) => a.order - b.order);
        break;
    }

    return result;
  }, [todos, filter, sort, search]);

  /** 统计信息 */
  const stats = useMemo(() => {
    const total = todos.length;
    const completed = todos.filter((t) => t.completed).length;
    const active = total - completed;
    const overdue = todos.filter((t) => !t.completed && isOverdue(t.dueDate)).length;
    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
    return { total, completed, active, overdue, percentage };
  }, [todos]);

  const changeFilter = useCallback((f: FilterType) => setFilter(f), []);
  const changeSort = useCallback((s: SortType) => setSort(s), []);
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
