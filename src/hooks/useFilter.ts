/**
 * @file useFilter - 筛选与排序 Hook
 * @description 管理当前项目的筛选视图与排序方式。
 * 排序方式与状态筛选按项目独立持久化（settings 表 `filter.<projectId>` /
 * `sort.<projectId>`），切换项目时各自回到该项目的上次选择。
 * 全局事项搜索由 App 单独管理，不参与当前项目的列表筛选。
 *
 * filter / sort 采用「同步派生」而非 useState + useEffect：
 * 当 projectId 变化时，filter 与 sort 在渲染阶段即从 DB 读取并参与
 * filteredTodos 计算，消除旧架构中 useEffect 滞后一帧导致的「旧项目
 * 筛选条件短暂残留到新项目」问题。
 */

import { useCallback, useMemo, useState } from 'react';
import type { Todo, FilterType, SortType } from '../types';
import * as db from '../utils/database';
import { DEFAULT_SORT, readProjectSort, sortKey, sortTodos } from '../utils/sortTodos';

/** 默认值 */
const DEFAULT_FILTER: FilterType = 'all';

/** 合法值白名单（防 settings 表脏值导致 UI 异常） */
const FILTER_VALUES: readonly FilterType[] = ['all', 'active', 'completed'];

/** per-project settings 命名键 */
const filterKey = (pid: string) => `filter.${pid}`;

/** 从 settings 表读取该项目持久化的筛选值（无值或脏值回退默认） */
function readFilter(pid: string): FilterType {
  const v = db.getSetting(filterKey(pid));
  return v && (FILTER_VALUES as readonly string[]).includes(v) ? (v as FilterType) : DEFAULT_FILTER;
}

/**
 * @param overrideFilter 临时覆盖当前项目的筛选值（不写盘、不替换用户选择）。
 *   供全局搜索定位时强制展示目标事项：跳到结果后 FilterBar 仍显示用户原筛选，
 *   只在本次定位渲染中视作 'all'，避免目标被 'active'/'completed' 隐藏后无反馈。
 */
export function useFilter(todos: Todo[], projectId: string, overrideFilter?: FilterType | null) {
  // === 用户显式修改的覆盖值（per-project），未覆盖时回退到 DB 持久值 ===
  const [filterOverrides, setFilterOverrides] = useState<Record<string, FilterType>>({});
  const [sortOverrides, setSortOverrides] = useState<Record<string, SortType>>({});

  // === 同步派生 filter / sort：projectId 变化时在渲染阶段即读取 DB，不滞后一帧 ===
  // 优先级：临时覆盖 > 用户本次显式选择 > DB 持久值 > 默认值
  const filter = useMemo((): FilterType => {
    if (!projectId) return DEFAULT_FILTER;
    return overrideFilter ?? filterOverrides[projectId] ?? readFilter(projectId);
  }, [projectId, filterOverrides, overrideFilter]);

  const sort = useMemo((): SortType => {
    if (!projectId) return DEFAULT_SORT;
    return sortOverrides[projectId] ?? readProjectSort(projectId);
  }, [projectId, sortOverrides]);

  /** 筛选后的 Todo 列表 */
  const filteredTodos = useMemo(() => {
    let result = [...todos];

    // 1. 状态筛选
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

    // 2. 排序：置顶项恒居顶 + 按 sort 规则排序（逻辑抽到 sortTodos，
    //    与贴图窗口共用同一份实现，保证两端排序完全一致）。
    result = sortTodos(result, sort);

    return result;
  }, [todos, filter, sort]);

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
      if (!projectId) return;
      // 同时写入本地覆盖 + 持久化到 DB（同一值避免无意义重渲染）
      setFilterOverrides((prev) => (prev[projectId] === f ? prev : { ...prev, [projectId]: f }));
      db.setSetting(filterKey(projectId), f);
    },
    [projectId],
  );
  const changeSort = useCallback(
    (s: SortType) => {
      if (!projectId) return;
      setSortOverrides((prev) => (prev[projectId] === s ? prev : { ...prev, [projectId]: s }));
      db.setSetting(sortKey(projectId), s);
    },
    [projectId],
  );
  return {
    filter,
    sort,
    filteredTodos,
    stats,
    changeFilter,
    changeSort,
  };
}
