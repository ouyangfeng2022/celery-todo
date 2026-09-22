/**
 * @file sortTodos 排序纯函数单元测试
 * @description 覆盖方式 × 方向四种排序、manual、置顶分组，以及持久化值归一化
 *   （旧值 priority 迁移、脏值回退）与方向切换辅助函数。
 */

import { describe, it, expect } from 'vitest';
import type { Todo } from '../entities';
import {
  DEFAULT_SORT,
  normalizeSortValue,
  sortDirectionOf,
  sortFieldOf,
  sortTodos,
  toggleSortDirection,
} from '../sortTodos';

// 构造 todo 的便捷工厂：createdAt 必填且参与排序断言
function makeTodo(overrides: Partial<Todo> = {}): Todo {
  const now = '2026-09-01T00:00:00.000Z';
  return {
    id: overrides.id ?? 't1',
    projectId: overrides.projectId ?? 'p1',
    title: overrides.title ?? 'x',
    completed: overrides.completed ?? false,
    priority: overrides.priority ?? 'medium',
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    order: overrides.order ?? 0,
    pinned: overrides.pinned ?? false,
  };
}

describe('sortTodos', () => {
  it('created-desc：新增（createdAt 晚）在前', () => {
    const todos = [
      makeTodo({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z' }),
      makeTodo({ id: 'new', createdAt: '2026-09-01T00:00:00.000Z' }),
    ];
    expect(sortTodos(todos, 'created-desc').map((t) => t.id)).toEqual(['new', 'old']);
  });

  it('created-asc：最早创建在前', () => {
    const todos = [
      makeTodo({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z' }),
      makeTodo({ id: 'new', createdAt: '2026-09-01T00:00:00.000Z' }),
    ];
    expect(sortTodos(todos, 'created-asc').map((t) => t.id)).toEqual(['old', 'new']);
  });

  it('priority-desc：high → low，同优先级按创建时间降序', () => {
    const todos = [
      makeTodo({ id: 'low-new', priority: 'low', createdAt: '2026-09-01T00:00:00.000Z' }),
      makeTodo({ id: 'high-new', priority: 'high', createdAt: '2026-09-01T00:00:00.000Z' }),
      makeTodo({ id: 'high-old', priority: 'high', createdAt: '2026-01-01T00:00:00.000Z' }),
      makeTodo({ id: 'mid', priority: 'medium', createdAt: '2026-06-01T00:00:00.000Z' }),
    ];
    expect(sortTodos(todos, 'priority-desc').map((t) => t.id)).toEqual([
      'high-new',
      'high-old',
      'mid',
      'low-new',
    ]);
  });

  it('priority-asc：low → high，同优先级按创建时间升序', () => {
    const todos = [
      makeTodo({ id: 'low-new', priority: 'low', createdAt: '2026-09-01T00:00:00.000Z' }),
      makeTodo({ id: 'low-old', priority: 'low', createdAt: '2026-01-01T00:00:00.000Z' }),
      makeTodo({ id: 'high', priority: 'high', createdAt: '2026-06-01T00:00:00.000Z' }),
      makeTodo({ id: 'mid', priority: 'medium', createdAt: '2026-06-01T00:00:00.000Z' }),
    ];
    expect(sortTodos(todos, 'priority-asc').map((t) => t.id)).toEqual([
      'low-old',
      'low-new',
      'mid',
      'high',
    ]);
  });

  it('manual：按 order 升序', () => {
    const todos = [
      makeTodo({ id: 'b', order: 2 }),
      makeTodo({ id: 'a', order: 1 }),
      makeTodo({ id: 'c', order: 3 }),
    ];
    expect(sortTodos(todos, 'manual').map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('置顶项恒居顶，置顶组与非置顶组各自按规则排序', () => {
    const todos = [
      makeTodo({ id: 'normal-new', createdAt: '2026-09-01T00:00:00.000Z' }),
      makeTodo({ id: 'pin-old', pinned: true, createdAt: '2026-01-01T00:00:00.000Z' }),
      makeTodo({ id: 'normal-old', createdAt: '2026-01-01T00:00:00.000Z' }),
      makeTodo({ id: 'pin-new', pinned: true, createdAt: '2026-09-01T00:00:00.000Z' }),
    ];
    expect(sortTodos(todos, 'created-asc').map((t) => t.id)).toEqual([
      'pin-old',
      'pin-new',
      'normal-old',
      'normal-new',
    ]);
  });

  it('不 mutate 入参数组', () => {
    const todos = [
      makeTodo({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z' }),
      makeTodo({ id: 'new', createdAt: '2026-09-01T00:00:00.000Z' }),
    ];
    const snapshot = [...todos];
    sortTodos(todos, 'created-asc');
    expect(todos).toEqual(snapshot);
  });
});

describe('normalizeSortValue', () => {
  it('旧值 priority（方向拆分前）归一为 priority-desc，保持老用户偏好', () => {
    expect(normalizeSortValue('priority')).toBe('priority-desc');
  });

  it('白名单内的值原样返回', () => {
    expect(normalizeSortValue('created-asc')).toBe('created-asc');
    expect(normalizeSortValue('priority-asc')).toBe('priority-asc');
    expect(normalizeSortValue('manual')).toBe('manual');
  });

  it('脏值与空值回退默认', () => {
    expect(normalizeSortValue('garbage')).toBe(DEFAULT_SORT);
    expect(normalizeSortValue(null)).toBe(DEFAULT_SORT);
    expect(normalizeSortValue(undefined)).toBe(DEFAULT_SORT);
  });
});

describe('排序辅助函数', () => {
  it('sortFieldOf / sortDirectionOf：拆出方式与方向；manual 无方式', () => {
    expect(sortFieldOf('created-asc')).toBe('created');
    expect(sortFieldOf('created-desc')).toBe('created');
    expect(sortFieldOf('priority-desc')).toBe('priority');
    expect(sortFieldOf('manual')).toBeNull();
    expect(sortDirectionOf('created-asc')).toBe('asc');
    expect(sortDirectionOf('priority-desc')).toBe('desc');
    expect(sortDirectionOf('manual')).toBe('desc');
  });

  it('toggleSortDirection：在 asc/desc 间切换；manual 原样返回', () => {
    expect(toggleSortDirection('created-desc')).toBe('created-asc');
    expect(toggleSortDirection('created-asc')).toBe('created-desc');
    expect(toggleSortDirection('priority-desc')).toBe('priority-asc');
    expect(toggleSortDirection('priority-asc')).toBe('priority-desc');
    expect(toggleSortDirection('manual')).toBe('manual');
  });
});
