/**
 * @file Todo Store - 基于 Zustand 的事项状态管理
 * @description 管理当前项目的 Todo 列表，包括增删改查、批量操作、归档（历史记录）等
 */

import { create } from 'zustand';
import type { Todo, DeletedTodo, Priority, BatchAction } from '../types';
import * as db from '../utils/database';
import { generateId, splitBulkTitles } from '../utils/helpers';

// ============================================
// Store 类型定义
// ============================================

interface TodoState {
  /** 当前项目的 Todo 列表 */
  todos: Todo[];
  /** 当前项目的归档事项（历史记录） */
  deletedTodos: DeletedTodo[];
  /** 当前项目 ID */
  currentProjectId: string;
  /** 是否正在加载 */
  loading: boolean;
  /** 选中的 Todo ID 集合（批量操作） */
  selectedIds: Set<string>;

  // === 加载 ===
  /** 加载指定项目的数据 */
  loadProject: (projectId: string) => void;

  // === 增删改 ===
  /** 添加单个 Todo */
  addTodo: (params: {
    title: string;
    description?: string;
    priority?: Priority;
    dueDate?: string;
  }) => void;
  /** 批量添加 Todo（用换行分隔的标题） */
  addTodosBulk: (rawText: string, priority?: Priority, dueDate?: string) => void;
  /** 更新 Todo */
  updateTodo: (id: string, updates: Partial<Omit<Todo, 'id' | 'projectId' | 'createdAt'>>) => void;
  /** 删除 Todo（归档：移入历史记录，可恢复或永久删除） */
  deleteTodo: (id: string) => void;
  /** 切换完成状态 */
  toggleTodo: (id: string) => void;

  // === 批量操作 ===
  /** 切换选中状态 */
  toggleSelected: (id: string) => void;
  /** 全选/取消全选 */
  selectAll: () => void;
  /** 清空选中 */
  clearSelection: () => void;
  /** 执行批量操作 */
  batchAction: (action: BatchAction, priority?: Priority) => void;

  // === 排序 ===
  /** 更新排序顺序（拖拽后调用） */
  reorderTodos: (sourceId: string, targetId: string) => void;
  /**
   * 把传入的显示顺序快照为 todo.order（拖拽切入 manual 前调用）。
   * store.todos 固定按 sort_order ASC（≈创建顺序）排，与用户在
   * created-desc 等模式下的视图反向；若直接 reorder，splice 的索引
   * 来自 DB 序而非视图序，结果会跳序。此处先把视图顺序固化到 order，
   * 让后续 reorder 在与视图一致的数组上执行。
   */
  snapshotOrder: (displayedIds: string[]) => void;

  // === 归档 / 历史记录 ===
  /** 恢复归档事项（重新回到当前项目 todos） */
  restoreTodo: (id: string) => void;
  /** 永久删除归档事项（不可恢复） */
  permanentlyDelete: (id: string) => void;
  /** 清空当前项目的归档 */
  emptyArchive: () => void;

  // === 清理 ===
  /** 清空已完成（归档已完成的 todo） */
  clearCompleted: () => void;
}

// ============================================
// Store 实现
// ============================================

export const useTodoStore = create<TodoState>((set, get) => ({
  todos: [],
  deletedTodos: [],
  currentProjectId: '',
  loading: false,
  selectedIds: new Set<string>(),

  loadProject: (projectId: string) => {
    set({ currentProjectId: projectId, loading: true });
    const todos = db.getTodosByProject(projectId);
    const deletedTodos = db.getDeletedTodosByProject(projectId);
    set({ todos, deletedTodos, loading: false, selectedIds: new Set() });
  },

  addTodo: ({ title, description, priority = 'medium', dueDate }) => {
    const { currentProjectId, todos } = get();
    const now = new Date().toISOString();
    const maxOrder = todos.length > 0 ? Math.max(...todos.map((t) => t.order)) : 0;
    const newTodo: Todo = {
      id: generateId(),
      projectId: currentProjectId,
      title: title.trim(),
      description: description?.trim() || undefined,
      completed: false,
      priority,
      dueDate: dueDate || undefined,
      createdAt: now,
      updatedAt: now,
      order: maxOrder + 1,
    };
    db.insertTodo(newTodo);
    set({ todos: [...todos, newTodo] });
  },

  addTodosBulk: (rawText, priority = 'medium', dueDate) => {
    const { currentProjectId, todos } = get();
    // 按换行分隔（逗号/分号视为普通字符）
    const titles = splitBulkTitles(rawText);

    if (titles.length === 0) return;

    const now = new Date().toISOString();
    let baseOrder = todos.length > 0 ? Math.max(...todos.map((t) => t.order)) : 0;
    const newTodos: Todo[] = titles.map((title) => {
      const todo: Todo = {
        id: generateId(),
        projectId: currentProjectId,
        title,
        completed: false,
        priority,
        dueDate: dueDate || undefined,
        createdAt: now,
        updatedAt: now,
        order: ++baseOrder,
      };
      db.insertTodo(todo);
      return todo;
    });

    set({ todos: [...todos, ...newTodos] });
  },

  updateTodo: (id, updates) => {
    const { todos } = get();
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;

    const updatedTodo: Todo = {
      ...todo,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    db.updateTodo(updatedTodo);
    set({ todos: todos.map((t) => (t.id === id ? updatedTodo : t)) });
  },

  deleteTodo: (id) => {
    const { todos } = get();
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;

    // 归档模式：归档永久保留，expiresAt 不再有自动清除语义，
    // 写入与 deletedAt 相同的时间戳作为占位以维持类型契约。
    const now = new Date();
    const archivedAt = now.toISOString();
    const deletedTodo: DeletedTodo = {
      ...todo,
      deletedAt: archivedAt,
      expiresAt: archivedAt,
    };

    db.insertDeletedTodo(deletedTodo);
    db.deleteTodo(id);

    set({
      todos: todos.filter((t) => t.id !== id),
      deletedTodos: [deletedTodo, ...get().deletedTodos],
      selectedIds: (() => {
        const next = new Set(get().selectedIds);
        next.delete(id);
        return next;
      })(),
    });
  },

  toggleTodo: (id) => {
    const { todos } = get();
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;

    const now = new Date().toISOString();
    const updatedTodo: Todo = {
      ...todo,
      completed: !todo.completed,
      completedAt: !todo.completed ? now : undefined,
      updatedAt: now,
    };
    db.updateTodo(updatedTodo);
    set({ todos: todos.map((t) => (t.id === id ? updatedTodo : t)) });
  },

  toggleSelected: (id) => {
    const next = new Set(get().selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    set({ selectedIds: next });
  },

  selectAll: () => {
    const { todos } = get();
    set({ selectedIds: new Set(todos.map((t) => t.id)) });
  },

  clearSelection: () => {
    set({ selectedIds: new Set() });
  },

  batchAction: (action, priority) => {
    const { selectedIds, todos } = get();
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    switch (action) {
      case 'complete': {
        const updated = todos.map((t) =>
          selectedIds.has(t.id)
            ? {
                ...t,
                completed: true,
                completedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            : t,
        );
        updated.forEach((t) => {
          if (selectedIds.has(t.id)) db.updateTodo(t);
        });
        set({ todos: updated, selectedIds: new Set() });
        break;
      }
      case 'uncomplete': {
        const updated = todos.map((t) =>
          selectedIds.has(t.id)
            ? {
                ...t,
                completed: false,
                completedAt: undefined,
                updatedAt: new Date().toISOString(),
              }
            : t,
        );
        updated.forEach((t) => {
          if (selectedIds.has(t.id)) db.updateTodo(t);
        });
        set({ todos: updated, selectedIds: new Set() });
        break;
      }
      case 'delete': {
        // 归档模式：expiresAt 不再有自动清除语义，用 archivedAt 占位
        const now = new Date();
        const archivedAt = now.toISOString();
        const toDelete = todos.filter((t) => selectedIds.has(t.id));
        toDelete.forEach((t) => {
          const deleted: DeletedTodo = { ...t, deletedAt: archivedAt, expiresAt: archivedAt };
          db.insertDeletedTodo(deleted);
        });
        db.deleteTodos(ids);
        set({
          todos: todos.filter((t) => !selectedIds.has(t.id)),
          deletedTodos: [
            ...toDelete.map((t) => ({ ...t, deletedAt: archivedAt, expiresAt: archivedAt })),
            ...get().deletedTodos,
          ],
          selectedIds: new Set(),
        });
        break;
      }
      case 'setPriority': {
        if (!priority) return;
        const updated = todos.map((t) =>
          selectedIds.has(t.id) ? { ...t, priority, updatedAt: new Date().toISOString() } : t,
        );
        updated.forEach((t) => {
          if (selectedIds.has(t.id)) db.updateTodo(t);
        });
        set({ todos: updated, selectedIds: new Set() });
        break;
      }
    }
  },

  reorderTodos: (sourceId, targetId) => {
    const { todos } = get();
    if (sourceId === targetId) return;

    const sourceIdx = todos.findIndex((t) => t.id === sourceId);
    const targetIdx = todos.findIndex((t) => t.id === targetId);
    if (sourceIdx === -1 || targetIdx === -1) return;

    // 重新排列数组
    const newTodos = [...todos];
    const [moved] = newTodos.splice(sourceIdx, 1);
    newTodos.splice(targetIdx, 0, moved);

    // 重新分配 order
    const reordered = newTodos.map((t, idx) => ({ ...t, order: idx + 1 }));
    reordered.forEach((t) => db.updateTodo(t));
    set({ todos: reordered });
  },

  snapshotOrder: (displayedIds: string[]) => {
    const { todos } = get();
    if (todos.length === 0) return;

    const displayedSet = new Set(displayedIds);
    const byId = new Map(todos.map((t) => [t.id, t]));
    // 显示中的按显示顺序排前面，未显示的（被筛选/搜索剔除的）按原 order 追加后面，
    // 整体重分配连续的 order，避免与未显示 todo 的旧 order 冲突，也顺带修复老数据
    // 中 order 不连续的历史问题。
    const displayed = displayedIds
      .map((id) => byId.get(id))
      .filter((t): t is Todo => t !== undefined);
    const rest = todos.filter((t) => !displayedSet.has(t.id));
    const reordered = [...displayed, ...rest].map((t, idx) => ({ ...t, order: idx + 1 }));
    reordered.forEach((t) => db.updateTodo(t));
    set({ todos: reordered });
  },

  restoreTodo: (id) => {
    db.restoreTodo(id);
    const todos = db.getTodosByProject(get().currentProjectId);
    const deletedTodos = db.getDeletedTodosByProject(get().currentProjectId);
    set({ todos, deletedTodos });
  },

  permanentlyDelete: (id) => {
    db.permanentlyDeleteTodo(id);
    set({ deletedTodos: get().deletedTodos.filter((t) => t.id !== id) });
  },

  emptyArchive: () => {
    db.emptyArchive(get().currentProjectId);
    set({ deletedTodos: [] });
  },

  clearCompleted: () => {
    const { todos } = get();
    const completed = todos.filter((t) => t.completed);
    // 归档模式：expiresAt 用 archivedAt 占位（不再有自动清除）
    const now = new Date();
    const archivedAt = now.toISOString();

    completed.forEach((t) => {
      const deleted: DeletedTodo = { ...t, deletedAt: archivedAt, expiresAt: archivedAt };
      db.insertDeletedTodo(deleted);
      db.deleteTodo(t.id);
    });

    set({
      todos: todos.filter((t) => !t.completed),
      deletedTodos: [
        ...completed.map((t) => ({ ...t, deletedAt: archivedAt, expiresAt: archivedAt })),
        ...get().deletedTodos,
      ],
    });
  },
}));
