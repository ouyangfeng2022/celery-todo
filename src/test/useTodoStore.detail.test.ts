import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Todo } from '../types';

// 仅 mock moveTodoToProject 路径会用到的 data 调用。其他 action 不会在 detail/moveTodo
// 测试里触发，但 vi.mock 是 hoist 的，必须把 store 实现里所有可能被引到的 data.*
// 都列出来，避免落到真实 sql.js WASM。
vi.mock('../utils/dataGateway', () => ({
  moveTodoToProject: vi.fn(),
}));

const dataModule = await import('../utils/dataGateway');
const moveTodoToProject = vi.mocked(dataModule.moveTodoToProject);
const { useTodoStore } = await import('../store/useTodoStore');

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 't1',
    projectId: 'p-current',
    title: '示例事项',
    completed: false,
    priority: 'medium',
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
    order: 1,
    pinned: false,
    ...overrides,
  };
}

function seed(todos: Todo[], currentProjectId = 'p-current') {
  useTodoStore.setState({ todos, currentProjectId, detailTodoId: null });
}

describe('useTodoStore 详情浮窗状态', () => {
  beforeEach(() => {
    seed([]);
  });

  it('openDetail 写入 detailTodoId；closeDetail 清空', () => {
    useTodoStore.getState().openDetail('t1');
    expect(useTodoStore.getState().detailTodoId).toBe('t1');

    useTodoStore.getState().closeDetail();
    expect(useTodoStore.getState().detailTodoId).toBeNull();
  });

  it('重复 openDetail 切换到不同 id 时取最新值', () => {
    useTodoStore.getState().openDetail('t1');
    useTodoStore.getState().openDetail('t2');
    expect(useTodoStore.getState().detailTodoId).toBe('t2');
  });
});

describe('useTodoStore.moveTodo', () => {
  beforeEach(() => {
    moveTodoToProject.mockClear();
    moveTodoToProject.mockReset();
  });

  it('跨项目移动：调用 data.moveTodoToProject，并从当前 todos 移除该条', async () => {
    const t = makeTodo({ id: 't1', projectId: 'p-current' });
    seed([t, makeTodo({ id: 't2', projectId: 'p-current' })]);

    moveTodoToProject.mockResolvedValue({ ...t, projectId: 'p-other' });
    await useTodoStore.getState().moveTodo('t1', 'p-other');

    expect(moveTodoToProject).toHaveBeenCalledWith('t1', 'p-other');
    expect(useTodoStore.getState().todos.map((x) => x.id)).toEqual(['t2']);
  });

  it('跨项目移动：浮窗打开时关闭（detailTodoId 置空）', async () => {
    const t = makeTodo({ id: 't1', projectId: 'p-current' });
    seed([t]);
    useTodoStore.setState({ detailTodoId: 't1' });

    moveTodoToProject.mockResolvedValue({ ...t, projectId: 'p-other' });
    await useTodoStore.getState().moveTodo('t1', 'p-other');

    expect(useTodoStore.getState().detailTodoId).toBeNull();
  });

  it('目标项目与当前项目相同：保留在 todos 中，且不关闭浮窗', async () => {
    // 场景：用户在 p-current 里看着 todo，又把项目下拉切回 p-current（无意义操作）。
    // currentProjectId === 目标 projectId，无需从列表移除，浮窗也不应关闭。
    const t = makeTodo({ id: 't1', projectId: 'p-current' });
    seed([t], 'p-current');
    useTodoStore.setState({ detailTodoId: 't1' });

    moveTodoToProject.mockResolvedValue(t);
    await useTodoStore.getState().moveTodo('t1', 'p-current');

    expect(useTodoStore.getState().todos.map((x) => x.id)).toEqual(['t1']);
    expect(useTodoStore.getState().detailTodoId).toBe('t1');
  });

  it('todo 不存在或 projectId 已等于目标：不调用 data.moveTodoToProject', async () => {
    seed([makeTodo({ id: 't1', projectId: 'p-current' })]);

    // 目标与源相同：早退
    await useTodoStore.getState().moveTodo('t1', 'p-current');
    expect(moveTodoToProject).not.toHaveBeenCalled();

    // id 不存在：早退
    await useTodoStore.getState().moveTodo('missing', 'p-other');
    expect(moveTodoToProject).not.toHaveBeenCalled();
  });
});
