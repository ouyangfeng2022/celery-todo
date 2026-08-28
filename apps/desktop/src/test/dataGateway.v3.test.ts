/**
 * v3 数据网关映射层测试：用内存适配器验证 dataGateway 对 2.x 函数面的实现
 * （order ↔ rank、deletedAt ↔ archivedAt、拖拽重排、全量替换、恢复回落收集箱）。
 * Tauri 命令桥本身由 Rust 侧测试 + @celery/test-contracts 契约覆盖。
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryRepositories } from '@celery/data';
import * as data from '../utils/dataGateway';
import type { DeletedTodo, Project, Todo } from '../types';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: '项目一',
    kind: 'user',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    order: 0,
    ...overrides,
  };
}

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 't1',
    projectId: 'p1',
    title: '事项',
    completed: false,
    priority: 'medium',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    order: 0,
    pinned: false,
    ...overrides,
  };
}

describe('dataGateway（v3 内存适配器）', () => {
  beforeEach(() => {
    data.configureDataGateway(createMemoryRepositories());
  });

  it('项目 CRUD：create 回读拿到服务端分配的 order；软删除即归档', async () => {
    await data.insertProject(makeProject({ id: 'p1', order: 0 }));
    await data.insertProject(makeProject({ id: 'p2', name: '项目二', order: 0 }));
    const projects = await data.getProjects();
    expect(projects.map((p) => p.id)).toEqual(['p1', 'p2']);
    // 服务端按追加序分配 rank（同尺度递增），不再是本地传入的 0
    expect(projects[0].order).toBeLessThan(projects[1].order);

    await data.deleteProject('p2');
    expect((await data.getProjects()).map((p) => p.id)).toEqual(['p1']);
    // includeArchived 语义：内存 list(true) 仍可见（网关 getProjects 默认排除）
    await data.updateProject(makeProject({ id: 'p2', name: '项目二改名' }));
  });

  it('todo 写读往返：order ↔ rank 映射与 plannedDate/description 空值', async () => {
    await data.insertProject(makeProject());
    await data.insertTodo(
      makeTodo({ id: 't1', order: 65536, description: '说明', plannedDate: '2026-08-20' }),
    );
    await data.insertTodo(makeTodo({ id: 't2', order: 131072 }));

    const todos = await data.getTodos('p1');
    expect(todos.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(todos[0].description).toBe('说明');
    expect(todos[0].plannedDate).toBe('2026-08-20');
    expect(todos[1].description).toBeUndefined();

    // 全字段更新：清空 description / plannedDate
    await data.updateTodo({ ...todos[0], description: undefined, plannedDate: undefined });
    const updated = (await data.getTodos('p1')).find((t) => t.id === 't1')!;
    expect(updated.description).toBeUndefined();
    expect(updated.plannedDate).toBeUndefined();
  });

  it('归档/恢复/永久删除：deletedAt 合成、恢复回落收集箱', async () => {
    await data.insertProject(makeProject());
    await data.insertTodo(makeTodo({ id: 't1', title: '待归档' }));
    const [archived] = await data.archiveTodos([makeTodo({ id: 't1', title: '待归档' })]);
    expect(archived.deletedAt).toBeTruthy();

    const deleted = await data.getDeletedTodos('p1');
    expect(deleted.map((t) => t.id)).toEqual(['t1']);
    expect((deleted[0] as DeletedTodo).deletedAt).toBeTruthy();

    // 原项目还在：恢复回原项目
    await data.restoreTodo('t1');
    expect((await data.getTodos('p1')).map((t) => t.id)).toEqual(['t1']);
    expect((await data.getDeletedTodos('p1')).length).toBe(0);

    // 原项目被永久删除后再恢复 → 落到收集箱，不静默丢数据
    // （软删除=归档的项目仍存在，恢复会回到原项目，与 Rust 语义一致）
    await data.insertTodo(makeTodo({ id: 't2' }));
    await data.archiveTodos([makeTodo({ id: 't2' })]);
    await data.permanentlyDeleteProject('p1');
    await data.restoreTodo('t2');
    const all = await data.getAllTodos();
    expect(all.map((t) => t.id)).toEqual(['t2']);
    const inbox = (await data.getProjects()).find((p) => p.kind === 'inbox');
    expect(inbox).toBeTruthy();
    expect(all[0].projectId).toBe(inbox!.id);

    await data.permanentlyDelete('t2');
    // t1 随项目永久删除被归档（保留快照），仍在历史记录中
    const remaining = await data.getAllDeletedTodos();
    expect(remaining.map((t) => t.id)).toEqual(['t1']);
  });

  it('moveTodoRank：数组移动语义 + 整组重编后顺序稳定', async () => {
    await data.insertProject(makeProject());
    await data.insertTodos([
      makeTodo({ id: 'a', order: 65536 }),
      makeTodo({ id: 'b', order: 131072 }),
      makeTodo({ id: 'c', order: 196608 }),
    ]);
    // 把 a 拖到 c 的位置：a 移出后插到 c 的索引 → 顺序 b, c, a
    const reordered = await data.moveTodoRank('p1', 'a', 'c');
    expect(reordered.map((t) => t.id)).toEqual(['b', 'c', 'a']);
    const persisted = await data.getTodos('p1');
    expect(persisted.map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('批量补丁分组：同形合并、异构逐条', async () => {
    await data.insertProject(makeProject());
    await data.insertTodos([makeTodo({ id: 'a' }), makeTodo({ id: 'b', completed: true })]);
    // 异构（a 未完成、b 已完成）→ 两条 update
    await data.updateTodos([
      makeTodo({ id: 'a', completed: true }),
      makeTodo({ id: 'b', completed: true }),
    ]);
    const todos = await data.getTodos('p1');
    expect(todos.every((t) => t.completed)).toBe(true);
    expect(todos.every((t) => t.completedAt !== undefined)).toBe(true);
  });

  it('replaceAll / reset：全量替换后 id/时间戳/完成态保留，设置以 K/V 落库', async () => {
    await data.insertProject(makeProject());
    await data.insertTodo(makeTodo({ id: 'old' }));
    await data.setSetting('theme', 'default');

    await data.replaceAll({
      version: 6,
      exportedAt: '2026-08-14T00:00:00.000Z',
      projects: [makeProject({ id: 'np', name: '新项目', order: 0 })],
      todos: [
        makeTodo({
          id: 'nt',
          projectId: 'np',
          completed: true,
          completedAt: '2026-08-10T00:00:00.000Z',
          order: 1024,
        }),
      ],
      deletedTodos: [
        {
          ...makeTodo({ id: 'na', projectId: 'np' }),
          deletedAt: '2026-08-12T00:00:00.000Z',
          expiresAt: '2026-09-11T00:00:00.000Z',
          projectName: '旧项目名',
        },
      ],
      settings: {
        theme: 'celery',
        colorMode: 'dark',
        autoStart: true,
        minimizeToTray: true,
        startupWindow: 'main',
        dataVersion: 9,
        focusMode: false,
        autoUpdateEnabled: true,
        lastActiveProjectId: 'np',
        customTemplates: [],
        todoViewMode: 'list',
        showWeeklyProjects: true,
        timeFormat: 'relative',
        stickerPreset: 'glass',
        stickerRadius: 22,
        stickerBlur: 38,
        stickerOpacity: 80,
        stickerShadow: false,
        stickerShowCompleted: true,
        completedSinkToBottom: false,
        showTimeLabels: true,
        showAllDoneCelebration: true,
      },
    });

    expect((await data.getProjects()).map((p) => p.id)).toEqual(['np']);
    const todos = await data.getTodos('np');
    expect(todos[0].id).toBe('nt');
    expect(todos[0].completed).toBe(true);
    expect(todos[0].completedAt).toBe('2026-08-10T00:00:00.000Z');
    const archived = await data.getDeletedTodos('np');
    // 项目名快照的精确值由 Rust replace_all 测试覆盖；内存路径经 archive 重建，
    // 契约的 archive 不携带快照，此处只断言快照字段存在（回退为当前项目名）。
    expect(archived[0].projectName).toBeTruthy();
    expect(await data.getSetting('theme')).toBe('celery');
    expect(await data.getSetting('lastActiveProjectId')).toBe('np');

    await data.reset();
    expect((await data.getProjects()).length).toBe(0);
    expect((await data.getAllTodos()).length).toBe(0);
    expect(await data.getSetting('theme')).toBeNull();
  });

  it('insertTodosIntoInbox：自动确保收集箱并写入', async () => {
    const inbox = await data.insertTodosIntoInbox([makeTodo({ id: 'i1', projectId: '' })]);
    expect(inbox.kind).toBe('inbox');
    const todos = await data.getTodos(inbox.id);
    expect(todos.map((t) => t.id)).toEqual(['i1']);
  });

  it('搜索跨项目命中标题与描述', async () => {
    await data.insertProject(makeProject());
    await data.insertProject(makeProject({ id: 'p2', name: '项目二' }));
    await data.insertTodo(makeTodo({ id: 't1', title: '买 celery' }));
    await data.insertTodo(
      makeTodo({ id: 't2', projectId: 'p2', description: '关于 celery 的说明' }),
    );
    const hits = await data.searchTodos('celery');
    expect(hits.map((t) => t.id).sort()).toEqual(['t1', 't2']);
  });
});
