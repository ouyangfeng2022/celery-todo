import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeletedTodo } from '../types';

// 仅 mock 归档清理路径会用到的 data 调用（vi.mock 是 hoist 的工厂，其他 data.*
// 不会在本测试触发，无需列出）。
vi.mock('../utils/dataGateway', () => ({
  emptyArchive: vi.fn(),
}));

const dataModule = await import('../utils/dataGateway');
const emptyArchive = vi.mocked(dataModule.emptyArchive);
const { useTodoStore } = await import('../store/useTodoStore');

function makeDeleted(id: string, projectId: string): DeletedTodo {
  return {
    id,
    projectId,
    title: `归档事项 ${id}`,
    completed: true,
    priority: 'medium',
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
    order: 1,
    pinned: false,
    deletedAt: '2026-09-01T00:00:00.000Z',
    expiresAt: '2026-10-01T00:00:00.000Z',
  };
}

describe('useTodoStore 归档清理', () => {
  beforeEach(() => {
    emptyArchive.mockClear();
    emptyArchive.mockReset();
    emptyArchive.mockResolvedValue();
  });

  it('emptyArchive 全局清空：不传项目 id（历史页「全部删除」是跨项目视图）', async () => {
    useTodoStore.setState({
      currentProjectId: 'p-current',
      deletedTodos: [makeDeleted('d1', 'p-current'), makeDeleted('d2', 'p-other')],
    });

    await useTodoStore.getState().emptyArchive();

    expect(emptyArchive).toHaveBeenCalledWith();
    expect(useTodoStore.getState().deletedTodos).toEqual([]);
  });

  it('emptyProjectArchive 按项目清空：只移除该项目归档，其余保留', async () => {
    useTodoStore.setState({
      currentProjectId: 'p-current',
      deletedTodos: [
        makeDeleted('d1', 'p-gone'),
        makeDeleted('d2', 'p-current'),
        makeDeleted('d3', 'p-gone'),
      ],
    });

    await useTodoStore.getState().emptyProjectArchive('p-gone');

    expect(emptyArchive).toHaveBeenCalledWith('p-gone');
    expect(useTodoStore.getState().deletedTodos.map((t) => t.id)).toEqual(['d2']);
  });
});
