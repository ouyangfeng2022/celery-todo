/**
 * @file sortTodos - 共享的 Todo 排序纯函数
 * @description 把"按 SortType 排序 + 置顶项恒居顶"这一规则抽出来，
 * 供主窗口（useFilter）与贴图窗口（StickerWindow）共用，确保两端排序
 * 完全一致。两端读写的持久化键都是 `sort.<projectId>`（settings 表），
 * 故主窗口改排序 → 贴图通过 data:changed 广播 refresh 后即同步。
 */

import type { SortType, Todo } from '../types';
import * as db from './database';

/** 默认排序值（与历史行为保持一致） */
export const DEFAULT_SORT: SortType = 'created-desc';

/** 合法值白名单（防 settings 表脏值导致 UI 异常） */
export const SORT_VALUES: readonly SortType[] = ['created-desc', 'priority', 'manual'];

/** per-project settings 命名键 */
export const sortKey = (pid: string) => `sort.${pid}`;

/** 优先级排序权重（high > medium > low，与 PRIORITY 顺序一致） */
const PRIORITY_WEIGHT: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * 从 settings 表读取该项目持久化的排序值（无值或脏值回退默认）。
 * 贴图窗口直接复用此函数读取主窗口写下的排序偏好。
 */
export function readProjectSort(pid: string): SortType {
  if (!pid) return DEFAULT_SORT;
  const v = db.getSetting(sortKey(pid));
  return v && (SORT_VALUES as readonly string[]).includes(v) ? (v as SortType) : DEFAULT_SORT;
}

/**
 * 按 sort 规则排序 todo 列表，置顶项（pinned）始终作为一组浮在最前，
 * 置顶组与非置顶组各自再按当前排序规则排。返回新数组，不 mutate 入参。
 *
 * 与主窗口 useFilter 的 filteredTodos 排序段行为完全等价。
 */
export function sortTodos(todos: Todo[], sort: SortType): Todo[] {
  const applySort = (arr: Todo[]) => {
    switch (sort) {
      case 'created-desc':
        arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
      case 'priority':
        // 主键：优先级降序（high > medium > low）
        // 次键：createdAt 降序（新增在前），与 created-desc 全局规则保持一致，
        //       不依赖 DB 返回顺序，也不受 sort_order 残留（拖拽快照）影响——
        //       非手动模式下严格按时间排序，绝不被历史拖拽污染。
        // （createdAt 同毫秒时比较器返回 0，由 sort 稳定性保留 DB 序；此为边界，
        //   实际 UI 中连续添加间隔远超 1ms，不影响可见顺序。）
        arr.sort(
          (a, b) =>
            PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
            b.createdAt.localeCompare(a.createdAt),
        );
        break;
      case 'manual':
        arr.sort((a, b) => a.order - b.order);
        break;
    }
  };
  // 先按 pinned 分两组，对每组分别排序后拼接，保证置顶稳定居顶。
  const pinned = todos.filter((t) => t.pinned);
  const unpinned = todos.filter((t) => !t.pinned);
  applySort(pinned);
  applySort(unpinned);
  return [...pinned, ...unpinned];
}
