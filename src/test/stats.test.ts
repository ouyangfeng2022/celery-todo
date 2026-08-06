/**
 * @file stats 工具函数单元测试
 * @description 覆盖 src/utils/stats.ts 的纯函数。buildHeatmap / computeStreaks 依赖
 *   「今天」，用 vi.useFakeTimers 锁定到固定日期避免时区/跨日 flakiness。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Todo, Project } from '../types';
import {
  buildHeatmap,
  computeStreaks,
  summarize,
  groupByPriority,
  groupByProject,
  toLocalDateKey,
} from '../utils/stats';

// 锁定到 2026-08-06（周三），让「今天/本周」相关断言稳定。
const FIXED_NOW = new Date(2026, 7, 6, 14, 30, 0); // 月份 0-based：7 = 8 月

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

// 构造 todo 的便捷工厂：默认未完成、medium 优先级
function makeTodo(overrides: Partial<Todo> = {}): Todo {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? 't1',
    projectId: overrides.projectId ?? 'p1',
    title: overrides.title ?? 'x',
    completed: overrides.completed ?? false,
    priority: overrides.priority ?? 'medium',
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    completedAt: overrides.completedAt,
    order: overrides.order ?? 1,
    pinned: overrides.pinned ?? false,
  };
}

// ============================================
// toLocalDateKey
// ============================================

describe('toLocalDateKey', () => {
  it('把本地日期转成 YYYY-MM-DD', () => {
    expect(toLocalDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toLocalDateKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
});

// ============================================
// buildHeatmap
// ============================================

describe('buildHeatmap', () => {
  it('返回 weeks*7 个格子，按日期升序', () => {
    const cells = buildHeatmap([], 'createdAt', 4);
    expect(cells).toHaveLength(4 * 7);
    // 升序：相邻日期差 1 天
    for (let i = 1; i < cells.length; i++) {
      const prev = new Date(cells[i - 1].date);
      const cur = new Date(cells[i].date);
      expect((cur.getTime() - prev.getTime()) / 86400000).toBe(1);
    }
  });

  it('weeks <= 0 返回空数组', () => {
    expect(buildHeatmap([], 'createdAt', 0)).toEqual([]);
  });

  it('最后一列对齐本周（含今天）', () => {
    const cells = buildHeatmap([], 'createdAt', 1);
    // 最后一列覆盖本周（周日 08-02 起算），应包含今天 08-06（周三）
    const lastWeek = cells.slice(-7);
    const dates = lastWeek.map((c) => c.date);
    expect(dates).toContain('2026-08-06');
    expect(dates[0]).toBe('2026-08-02'); // 本周日
  });

  it('按 createdAt 累计当天新建数', () => {
    const todo = makeTodo({ createdAt: '2026-08-06T10:00:00.000Z' });
    const cells = buildHeatmap([todo], 'createdAt', 1);
    const todayCell = cells.find((c) => c.date === '2026-08-06');
    expect(todayCell?.count).toBe(1);
  });

  it('按 completedAt 仅计入已完成事项的 completedAt', () => {
    const done = makeTodo({ completed: true, completedAt: '2026-08-06T10:00:00.000Z' });
    const notDone = makeTodo({ id: 't2', completed: false });
    const cells = buildHeatmap([done, notDone], 'completedAt', 1);
    const todayCell = cells.find((c) => c.date === '2026-08-06');
    expect(todayCell?.count).toBe(1);
  });

  it('未完成事项在 completedAt 模式下不计入', () => {
    const notDone = makeTodo({ completed: false });
    const cells = buildHeatmap([notDone], 'completedAt', 1);
    const todayCell = cells.find((c) => c.date === '2026-08-06');
    expect(todayCell?.count).toBe(0);
    expect(todayCell?.level).toBe(0);
  });

  it('无活动时所有格子 level 0', () => {
    const cells = buildHeatmap([], 'createdAt', 2);
    expect(cells.every((c) => c.level === 0 && c.count === 0)).toBe(true);
  });

  it('level 分档：单点非零值归 level 1（不被拉满到 4）', () => {
    const todo = makeTodo({ createdAt: '2026-08-06T10:00:00.000Z' });
    const cells = buildHeatmap([todo], 'createdAt', 1);
    const todayCell = cells.find((c) => c.date === '2026-08-06')!;
    expect(todayCell.count).toBe(1);
    expect(todayCell.level).toBe(1);
  });

  it('level 分档：计数越高 level 越高', () => {
    // 在不同天构造不同计数，让分位切档生效
    const todos: Todo[] = [];
    // 今天 5 项
    for (let i = 0; i < 5; i++) {
      todos.push(makeTodo({ id: `a${i}`, createdAt: '2026-08-06T10:00:00.000Z' }));
    }
    // 昨天 1 项
    todos.push(makeTodo({ id: 'b', createdAt: '2026-08-05T10:00:00.000Z' }));
    const cells = buildHeatmap(todos, 'createdAt', 4);
    const today = cells.find((c) => c.date === '2026-08-06')!;
    const yesterday = cells.find((c) => c.date === '2026-08-05')!;
    expect(today.level).toBeGreaterThan(yesterday.level);
  });
});

// ============================================
// computeStreaks
// ============================================

describe('computeStreaks', () => {
  it('空格子返回 0/0', () => {
    expect(computeStreaks([])).toEqual({ current: 0, longest: 0 });
  });

  it('全无活动返回 0/0', () => {
    const cells = buildHeatmap([], 'createdAt', 2);
    expect(computeStreaks(cells)).toEqual({ current: 0, longest: 0 });
  });

  it('今天有活动 → current 至少 1，longest >= current', () => {
    const todos = [makeTodo({ createdAt: '2026-08-06T10:00:00.000Z' })];
    const cells = buildHeatmap(todos, 'createdAt', 1);
    const { current, longest } = computeStreaks(cells);
    expect(current).toBeGreaterThanOrEqual(1);
    expect(longest).toBeGreaterThanOrEqual(current);
  });

  it('连续 3 天 → longest = 3', () => {
    const todos = [
      makeTodo({ id: '1', createdAt: '2026-08-04T10:00:00.000Z' }),
      makeTodo({ id: '2', createdAt: '2026-08-05T10:00:00.000Z' }),
      makeTodo({ id: '3', createdAt: '2026-08-06T10:00:00.000Z' }),
    ];
    const cells = buildHeatmap(todos, 'createdAt', 2);
    const { longest } = computeStreaks(cells);
    expect(longest).toBe(3);
  });

  it('昨天有活动今天无 → current 仍 >= 1（未断口径）', () => {
    const todos = [makeTodo({ createdAt: '2026-08-05T10:00:00.000Z' })];
    const cells = buildHeatmap(todos, 'createdAt', 2);
    const { current } = computeStreaks(cells);
    expect(current).toBeGreaterThanOrEqual(1);
  });
});

// ============================================
// summarize
// ============================================

describe('summarize', () => {
  it('空列表全部归零', () => {
    const s = summarize([]);
    expect(s.total).toBe(0);
    expect(s.completed).toBe(0);
    expect(s.active).toBe(0);
    expect(s.completionRate).toBe(0);
    expect(s.todayCompleted).toBe(0);
    expect(s.weekCompleted).toBe(0);
    expect(s.todayCreated).toBe(0);
    expect(s.weekCreated).toBe(0);
  });

  it('统计总数 / 已完成 / 待办 / 完成率', () => {
    const todos = [
      makeTodo({ id: '1', completed: true, completedAt: '2026-08-06T10:00:00.000Z' }),
      makeTodo({ id: '2', completed: true, completedAt: '2026-08-05T10:00:00.000Z' }),
      makeTodo({ id: '3', completed: false }),
    ];
    const s = summarize(todos);
    expect(s.total).toBe(3);
    expect(s.completed).toBe(2);
    expect(s.active).toBe(1);
    expect(s.completionRate).toBe(67); // round(2/3*100)
  });

  it('今日完成只计 completedAt 是今天的', () => {
    const todos = [
      makeTodo({ id: '1', completed: true, completedAt: '2026-08-06T10:00:00.000Z' }),
      makeTodo({ id: '2', completed: true, completedAt: '2026-08-05T10:00:00.000Z' }),
    ];
    const s = summarize(todos);
    expect(s.todayCompleted).toBe(1);
  });

  it('本周完成 = 周一至今天的完成数（本周一为 2026-08-03）', () => {
    const todos = [
      makeTodo({ id: '1', completed: true, completedAt: '2026-08-03T10:00:00.000Z' }), // 本周一
      makeTodo({ id: '2', completed: true, completedAt: '2026-08-06T10:00:00.000Z' }), // 今天
      makeTodo({ id: '3', completed: true, completedAt: '2026-08-02T10:00:00.000Z' }), // 上周日（不计）
    ];
    const s = summarize(todos);
    expect(s.weekCompleted).toBe(2);
  });

  it('今日新建只计 createdAt 是今天的（与完成状态无关）', () => {
    const todos = [
      makeTodo({ id: '1', createdAt: '2026-08-06T10:00:00.000Z', completed: false }),
      makeTodo({ id: '2', createdAt: '2026-08-05T10:00:00.000Z', completed: false }),
    ];
    const s = summarize(todos);
    expect(s.todayCreated).toBe(1);
  });

  it('本周新建 = 周一至今天的新建数（未完成也计）', () => {
    const todos = [
      makeTodo({ id: '1', createdAt: '2026-08-03T10:00:00.000Z' }), // 本周一
      makeTodo({ id: '2', createdAt: '2026-08-06T10:00:00.000Z' }), // 今天
      makeTodo({ id: '3', createdAt: '2026-08-02T10:00:00.000Z' }), // 上周日（不计）
    ];
    const s = summarize(todos);
    expect(s.weekCreated).toBe(2);
  });

  it('置顶计数', () => {
    const todos = [makeTodo({ id: '1', pinned: true }), makeTodo({ id: '2', pinned: false })];
    expect(summarize(todos).pinned).toBe(1);
  });
});

// ============================================
// groupByPriority
// ============================================

describe('groupByPriority', () => {
  it('固定返回 high/medium/low 三档顺序', () => {
    const slices = groupByPriority([]);
    expect(slices.map((s) => s.priority)).toEqual(['high', 'medium', 'low']);
    expect(slices.every((s) => s.count === 0)).toBe(true);
  });

  it('按优先级正确计数', () => {
    const todos = [
      makeTodo({ id: '1', priority: 'high' }),
      makeTodo({ id: '2', priority: 'high' }),
      makeTodo({ id: '3', priority: 'low' }),
    ];
    const slices = groupByPriority(todos);
    expect(slices.find((s) => s.priority === 'high')?.count).toBe(2);
    expect(slices.find((s) => s.priority === 'medium')?.count).toBe(0);
    expect(slices.find((s) => s.priority === 'low')?.count).toBe(1);
  });
});

// ============================================
// groupByProject
// ============================================

describe('groupByProject', () => {
  const projects: Project[] = [
    { id: 'p1', name: '工作', createdAt: '', updatedAt: '', order: 1 },
    { id: 'p2', name: '生活', createdAt: '', updatedAt: '', order: 2 },
  ];

  it('按项目聚合 total/completed/rate', () => {
    const todos = [
      makeTodo({
        id: '1',
        projectId: 'p1',
        completed: true,
        completedAt: '2026-08-06T10:00:00.000Z',
      }),
      makeTodo({ id: '2', projectId: 'p1', completed: false }),
      makeTodo({
        id: '3',
        projectId: 'p2',
        completed: true,
        completedAt: '2026-08-06T10:00:00.000Z',
      }),
    ];
    const stats = groupByProject(todos, projects);
    const work = stats.find((s) => s.project.id === 'p1')!;
    expect(work.total).toBe(2);
    expect(work.completed).toBe(1);
    expect(work.rate).toBe(50);
    const life = stats.find((s) => s.project.id === 'p2')!;
    expect(life.total).toBe(1);
    expect(life.rate).toBe(100);
  });

  it('按完成数倒序排序', () => {
    const todos = [
      makeTodo({
        id: '1',
        projectId: 'p1',
        completed: true,
        completedAt: '2026-08-06T10:00:00.000Z',
      }),
      makeTodo({
        id: '2',
        projectId: 'p2',
        completed: true,
        completedAt: '2026-08-06T10:00:00.000Z',
      }),
      makeTodo({
        id: '3',
        projectId: 'p2',
        completed: true,
        completedAt: '2026-08-06T10:00:00.000Z',
      }),
    ];
    const stats = groupByProject(todos, projects);
    // p2 完成数更多 → 排第一
    expect(stats[0].project.id).toBe('p2');
  });

  it('无对应项目的 todo（projectId 已删除）被剔除', () => {
    const todos = [makeTodo({ id: '1', projectId: 'p-deleted' })];
    const stats = groupByProject(todos, projects);
    expect(stats).toHaveLength(0);
  });
});
