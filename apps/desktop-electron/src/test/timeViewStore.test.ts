import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Todo } from '../types';
import {
  selectTimeBucketCounts,
  selectTimeBucketTodos,
  useTimeViewStore,
} from '../store/useTimeViewStore';

function makeTodo(id: string, plannedDate: string, completed = false): Todo {
  return {
    id,
    projectId: 'project-1',
    title: id,
    completed,
    priority: 'medium',
    plannedDate,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    order: Number(id.replace(/\D/g, '')) * 1024,
    pinned: false,
  };
}

describe('time view store selectors', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 12, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('本周视图覆盖完整自然周，而不是只显示今天和明天之后', () => {
    const allTodos = [
      makeTodo('todo-1', '2026-08-10'),
      makeTodo('todo-2', '2026-08-12'),
      makeTodo('todo-3', '2026-08-13'),
      makeTodo('todo-4', '2026-08-16'),
      makeTodo('todo-5', '2026-08-17'),
    ];
    useTimeViewStore.setState({ allTodos, bucket: 'week', filter: 'active' });

    expect(selectTimeBucketTodos(useTimeViewStore.getState()).map((todo) => todo.id)).toEqual([
      'todo-1',
      'todo-2',
      'todo-3',
      'todo-4',
    ]);
  });

  it('本周计数包含整周事项，同时保留今天与待重新安排的快捷计数', () => {
    const counts = selectTimeBucketCounts([
      makeTodo('todo-1', '2026-08-10'),
      makeTodo('todo-2', '2026-08-12'),
      makeTodo('todo-3', '2026-08-13'),
      makeTodo('todo-4', '2026-08-16'),
      makeTodo('todo-5', '2026-08-17'),
      makeTodo('todo-6', '2026-08-12', true),
    ]);

    expect(counts).toMatchObject({ replan: 1, today: 1, tomorrow: 1, week: 4, later: 1 });
  });
});
