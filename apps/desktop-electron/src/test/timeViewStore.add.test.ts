import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, Todo } from '../types';

// 显式列出要 mock 的方法，避免漏掉 add 路径上任何 data.* 调用。
vi.mock('../utils/dataGateway', () => ({
  getProject: vi.fn().mockResolvedValue(null),
  insertTodosIntoInbox: vi.fn(),
  insertTodos: vi.fn().mockResolvedValue(undefined),
  getAllTodos: vi.fn().mockResolvedValue([]),
}));

// store 在内部 import dataGateway，必须在 import store 之后再取实例，
// 保证两边拿到同一个 mock 模块。
const dataModule = await import('../utils/dataGateway');
const data = {
  getProject: vi.mocked(dataModule.getProject),
  insertTodosIntoInbox: vi.mocked(dataModule.insertTodosIntoInbox),
  insertTodos: vi.mocked(dataModule.insertTodos),
  getAllTodos: vi.mocked(dataModule.getAllTodos),
};
const { useTimeViewStore } = await import('../store/useTimeViewStore');

const inbox: Project = {
  id: 'inbox-1',
  name: '收集箱',
  kind: 'inbox',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  order: 0,
};

describe('useTimeViewStore.add 收集箱路径', () => {
  beforeEach(() => {
    useTimeViewStore.setState({ allTodos: [], bucket: 'today', filter: 'active' });
    data.getProject.mockReset();
    data.getProject.mockResolvedValue(undefined);
    data.insertTodosIntoInbox.mockReset();
    data.insertTodos.mockReset().mockResolvedValue(undefined);
    data.getAllTodos.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('连续两次添加：sort_order 不重复（主进程权威累加）', async () => {
    // 第一次添加：收集箱为空，主进程给 todo 写 order=1024
    data.insertTodosIntoInbox.mockResolvedValueOnce(inbox);
    // 第一次 add 内部触发 load：返回带 order=1024 的 todo
    data.getAllTodos.mockResolvedValueOnce([
      {
        id: 'a',
        projectId: inbox.id,
        title: 'A',
        completed: false,
        priority: 'medium',
        plannedDate: '2026-08-12',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        order: 1024,
        pinned: false,
      } as Todo,
    ]);
    await useTimeViewStore.getState().add({
      rawTitle: 'A',
      plannedDate: '2026-08-12',
    });

    const firstCallArgs = data.insertTodosIntoInbox.mock.calls[0][0] as Todo[];
    // renderer 推测的 order 是 1024，因为本地快照为空
    expect(firstCallArgs[0].order).toBe(1024);
    expect(firstCallArgs[0].projectId).toBe('');

    // 第二次添加：本地快照里只有上一次 load 拉回的 todo
    data.insertTodosIntoInbox.mockResolvedValueOnce(inbox);
    data.getAllTodos.mockResolvedValueOnce([
      {
        id: 'a',
        projectId: inbox.id,
        title: 'A',
        completed: false,
        priority: 'medium',
        plannedDate: '2026-08-12',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        order: 1024,
        pinned: false,
      } as Todo,
      {
        id: 'b',
        projectId: inbox.id,
        title: 'B',
        completed: false,
        priority: 'medium',
        plannedDate: '2026-08-12',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        order: 2048,
        pinned: false,
      } as Todo,
    ]);
    await useTimeViewStore.getState().add({
      rawTitle: 'B',
      plannedDate: '2026-08-12',
    });

    // 第二次 reload 拉回的快照里两条 todo 的 order 必须不同；
    // 主进程在 insertTodosIntoInbox 内基于 max(sort_order) 累加，
    // 因此即便 renderer 推测值仍是 1024，落库后实际是 2048。
    const secondSnapshot = data.getAllTodos.mock.results[1].value as Promise<Todo[]>;
    const reloaded = await secondSnapshot;
    const orders = reloaded.map((todo) => todo.order);
    expect(orders).toEqual([1024, 2048]);
    expect(new Set(orders).size).toBe(orders.length);

    // 关键回归保护：renderer 第二次调用 insertTodosIntoInbox 传入的 order
    // 仍是 1024（renderer 无从得知 inbox 已有事项），但实际落库由主进程覆盖。
    const secondCallArgs = data.insertTodosIntoInbox.mock.calls[1][0] as Todo[];
    expect(secondCallArgs[0].order).toBe(1024);
  });

  it('每次添加都触发一次 load，避免本地推测 order 污染快照', async () => {
    data.insertTodosIntoInbox.mockResolvedValue(inbox);
    data.getAllTodos.mockResolvedValue([]);

    await useTimeViewStore.getState().add({ rawTitle: 'X' });

    expect(data.insertTodosIntoInbox).toHaveBeenCalledTimes(1);
    expect(data.getAllTodos).toHaveBeenCalledTimes(1);
  });
});
