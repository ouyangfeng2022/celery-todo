/**
 * @file db.ts 数据层测试
 * @description 用临时数据库（helpers.createSeedDb）跑通 CRUD 全流程。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDatabase,
  deleteProject,
  emptyArchive,
  generateId,
  getAllDeletedTodos,
  getAllProjects,
  getAllTodos,
  getProjectById,
  getTodoById,
  insertProject,
  insertTodo,
  openDatabase,
  permanentlyDeleteTodo,
  resolveDeletedTodo,
  resolveProject,
  resolveTodo,
  restoreFromArchive,
  softDeleteTodo,
  updateTodo,
} from '../src/db-direct';
import type { Todo } from '../src/types';
import { createSeedDb, readAllRows, type SeedFixture } from './helpers';

// 测试里重命名 db.ts 导入为 storage-db 以便 vitest 解析；实际即 cli/src/db.ts
// （这条注释为辅助阅读，无需运行时处理）

describe('db data layer', () => {
  let fixture: SeedFixture;

  beforeEach(() => {
    fixture = createSeedDb({ withProject: true });
  });

  afterEach(() => {
    closeDatabase();
    fixture.cleanup();
  });

  it('openDatabase 后可读取种子项目', () => {
    openDatabase(fixture.filePath, false);
    const projects = getAllProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('默认项目');
  });

  it('insertTodo + getTodoById round-trip 保留所有字段', () => {
    openDatabase(fixture.filePath, false);
    const now = new Date().toISOString();
    const todo: Todo = {
      id: generateId(),
      projectId: fixture.projectId,
      title: '测试待办',
      description: '描述',
      completed: false,
      priority: 'high',
      dueDate: '2026-12-31T00:00:00.000Z',
      createdAt: now,
      updatedAt: now,
      order: 1,
    };
    insertTodo(todo);
    const got = getTodoById(todo.id);
    expect(got).not.toBeNull();
    expect(got).toMatchObject({
      title: '测试待办',
      priority: 'high',
      completed: false,
      order: 1,
    });
    expect(got?.description).toBe('描述');
    expect(got?.dueDate).toBe('2026-12-31T00:00:00.000Z');
  });

  it('updateTodo 写回字段后持久化', () => {
    openDatabase(fixture.filePath, false);
    const now = new Date().toISOString();
    const todo: Todo = {
      id: generateId(),
      projectId: fixture.projectId,
      title: '原始',
      completed: false,
      priority: 'low',
      createdAt: now,
      updatedAt: now,
      order: 1,
    };
    insertTodo(todo);
    updateTodo({ ...todo, title: '改后', completed: true, completedAt: now, priority: 'high' });
    const got = getTodoById(todo.id);
    expect(got?.title).toBe('改后');
    expect(got?.completed).toBe(true);
    expect(got?.priority).toBe('high');
    expect(got?.completedAt).toBe(now);
  });

  it('resolveTodo 支持完整 id 与唯一前缀', () => {
    openDatabase(fixture.filePath, false);
    const now = new Date().toISOString();
    const todo: Todo = {
      id: 'abcdef12-3456-7890-abcd-ef1234567890',
      projectId: fixture.projectId,
      title: '前缀测试',
      completed: false,
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
      order: 1,
    };
    insertTodo(todo);
    // 完整
    expect(resolveTodo(todo.id).title).toBe('前缀测试');
    // 短前缀
    expect(resolveTodo('abcdef12').id).toBe(todo.id);
    // 更短但唯一
    expect(resolveTodo('abc').id).toBe(todo.id);
  });

  it('resolveTodo 多前缀匹配时抛歧义错误', () => {
    openDatabase(fixture.filePath, false);
    const now = new Date().toISOString();
    const t1: Todo = {
      id: 'abc11111-0000-0000-0000-000000000000',
      projectId: fixture.projectId,
      title: 't1',
      completed: false,
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
      order: 1,
    };
    const t2: Todo = {
      id: 'abc22222-0000-0000-0000-000000000000',
      projectId: fixture.projectId,
      title: 't2',
      completed: false,
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
      order: 2,
    };
    insertTodo(t1);
    insertTodo(t2);
    expect(() => resolveTodo('abc')).toThrow(/匹配到多个/);
  });

  it('resolveTodo 未命中抛错', () => {
    openDatabase(fixture.filePath, false);
    expect(() => resolveTodo('zzzzzzzzzz')).toThrow(/未找到/);
  });

  it('softDeleteTodo 把行搬到 deleted_todos 并从 todos 删除', () => {
    openDatabase(fixture.filePath, false);
    const now = new Date().toISOString();
    const todo: Todo = {
      id: generateId(),
      projectId: fixture.projectId,
      title: '将删除',
      completed: false,
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
      order: 1,
    };
    insertTodo(todo);
    softDeleteTodo(todo, now, now);
    expect(getTodoById(todo.id)).toBeNull();
    const archived = getAllDeletedTodos();
    expect(archived).toHaveLength(1);
    expect(archived[0].id).toBe(todo.id);
    expect(archived[0].deletedAt).toBe(now);
  });

  it('restoreFromArchive 把行搬回 todos 并刷新 updated_at', () => {
    openDatabase(fixture.filePath, false);
    const now = new Date().toISOString();
    const todo: Todo = {
      id: generateId(),
      projectId: fixture.projectId,
      title: '归档项',
      completed: false,
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
      order: 1,
    };
    insertTodo(todo);
    softDeleteTodo(todo, now, now);
    const restoreTime = '2026-06-01T00:00:00.000Z';
    restoreFromArchive(todo.id, restoreTime);
    const restored = getTodoById(todo.id);
    expect(restored).not.toBeNull();
    expect(restored?.updatedAt).toBe(restoreTime);
    expect(getAllDeletedTodos()).toHaveLength(0);
  });

  it('resolveDeletedTodo 在归档表中按前缀解析', () => {
    openDatabase(fixture.filePath, false);
    const now = new Date().toISOString();
    const todo: Todo = {
      id: 'deadbeef-0000-0000-0000-000000000000',
      projectId: fixture.projectId,
      title: 'x',
      completed: false,
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
      order: 1,
    };
    insertTodo(todo);
    softDeleteTodo(todo, now, now);
    expect(resolveDeletedTodo('deadbeef').id).toBe(todo.id);
  });

  it('emptyArchive 清空全部归档', () => {
    openDatabase(fixture.filePath, false);
    const now = new Date().toISOString();
    const t: Todo = {
      id: generateId(),
      projectId: fixture.projectId,
      title: 'a',
      completed: false,
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
      order: 1,
    };
    insertTodo(t);
    softDeleteTodo(t, now, now);
    emptyArchive();
    expect(getAllDeletedTodos()).toHaveLength(0);
  });

  it('permanentlyDeleteTodo 删单个归档', () => {
    openDatabase(fixture.filePath, false);
    const now = new Date().toISOString();
    const t: Todo = {
      id: 'perm0001-0000-0000-0000-000000000000',
      projectId: fixture.projectId,
      title: 'a',
      completed: false,
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
      order: 1,
    };
    insertTodo(t);
    softDeleteTodo(t, now, now);
    permanentlyDeleteTodo(t.id);
    expect(getAllDeletedTodos()).toHaveLength(0);
  });

  it('resolveProject 支持完整 id、前缀、名称', () => {
    openDatabase(fixture.filePath, false);
    // 完整 id
    expect(resolveProject(fixture.projectId).name).toBe('默认项目');
    // 名称
    expect(resolveProject('默认项目').id).toBe(fixture.projectId);
    // 前缀（id 前缀，这里用足够长的前缀避免歧义）
    expect(resolveProject(fixture.projectId.slice(0, 8)).id).toBe(fixture.projectId);
  });

  it('resolveProject 未命中抛错', () => {
    openDatabase(fixture.filePath, false);
    expect(() => resolveProject('不存在的项目名')).toThrow(/未找到/);
  });

  it('insertProject 追加到末尾（order 自增）', () => {
    openDatabase(fixture.filePath, false);
    const now = new Date().toISOString();
    // 省略 order 触发 COALESCE 自增（MAX(0)+1 = 1）
    insertProject({
      id: generateId(),
      name: '新项目',
      createdAt: now,
      updatedAt: now,
    });
    const projects = getAllProjects();
    expect(projects).toHaveLength(2);
    const newest = projects[1];
    expect(newest.order).toBe(1);
  });

  it('deleteProject 连带删除其下 todos 与归档', () => {
    openDatabase(fixture.filePath, false);
    const now = new Date().toISOString();
    const t: Todo = {
      id: generateId(),
      projectId: fixture.projectId,
      title: 'a',
      completed: false,
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
      order: 1,
    };
    insertTodo(t);
    softDeleteTodo(t, now, now);
    deleteProject(fixture.projectId);
    expect(getProjectById(fixture.projectId)).toBeNull();
    expect(getAllTodos()).toHaveLength(0);
    expect(getAllDeletedTodos()).toHaveLength(0);
  });

  it('getDataVersion 读取 settings.dataVersion', () => {
    openDatabase(fixture.filePath, false);
    // 通过 getSetting 间接验证；dataVersion 已在 seed 中置为 2
    const rows = readAllRows<{ key: string; value: string }>(fixture.filePath, 'settings');
    const dv = rows.find((r) => r.key === 'dataVersion');
    expect(dv?.value).toBe('2');
  });

  it('只读模式下写入抛错', () => {
    openDatabase(fixture.filePath, true);
    const now = new Date().toISOString();
    const t: Todo = {
      id: generateId(),
      projectId: fixture.projectId,
      title: 'x',
      completed: false,
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
      order: 1,
    };
    expect(() => insertTodo(t)).toThrow();
  });
});
