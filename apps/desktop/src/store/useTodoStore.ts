/**
 * @file Todo Store - 基于 Zustand 的事项状态管理
 * @description 管理当前项目的 Todo 列表，包括增删改查、批量操作、归档（历史记录）等
 */

import { create } from 'zustand';
import type { Todo, DeletedTodo, Priority, BatchAction } from '../types';
import * as data from '../utils/dataGateway';
import { generateId, splitBulkTitles } from '../utils/helpers';

/** 与 crates/celery-db 的 RANK_GAP 对齐：客户端推测的新 rank 与服务端同尺度。 */
const RANK_STEP = 65_536;

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
  /** 当前打开详情浮窗的 todo id；为 null 时浮窗关闭 */
  detailTodoId: string | null;

  // === 加载 ===
  /** 加载指定项目的数据 */
  loadProject: (projectId: string) => Promise<void>;

  // === 增删改 ===
  /** 添加单个 Todo */
  addTodo: (params: {
    title: string;
    description?: string;
    priority?: Priority;
    plannedDate?: string;
  }) => Promise<void>;
  /** 批量添加 Todo（用换行分隔的标题） */
  addTodosBulk: (rawText: string, priority?: Priority, plannedDate?: string) => Promise<void>;
  /** 更新 Todo */
  updateTodo: (
    id: string,
    updates: Partial<Omit<Todo, 'id' | 'projectId' | 'createdAt'>>,
  ) => Promise<void>;
  /** 删除 Todo（归档：移入历史记录，可恢复或永久删除） */
  deleteTodo: (id: string) => Promise<void>;
  /** 切换完成状态 */
  toggleTodo: (id: string) => Promise<void>;
  /** 把 todo 移动到指定项目（updateTodo 因 Omit<projectId> 无法胜任） */
  moveTodo: (id: string, projectId: string) => Promise<void>;

  // === 详情浮窗 ===
  /** 打开指定 todo 的详情浮窗 */
  openDetail: (id: string) => void;
  /** 关闭详情浮窗 */
  closeDetail: () => void;

  // === 批量操作 ===
  /** 切换选中状态 */
  toggleSelected: (id: string) => void;
  /** 全选/取消全选 */
  selectAll: () => void;
  /** 清空选中 */
  clearSelection: () => void;
  /** 执行批量操作 */
  batchAction: (action: BatchAction, priority?: Priority) => Promise<void>;

  // === 排序 ===
  /** 更新排序顺序（拖拽后调用） */
  reorderTodos: (sourceId: string, targetId: string) => Promise<void>;
  /**
   * 把传入的显示顺序快照为 todo.order（拖拽切入 manual 前调用）。
   * store.todos 固定按 sort_order ASC（≈创建顺序）排，与用户在
   * created-desc 等模式下的视图反向；若直接 reorder，splice 的索引
   * 来自 DB 序而非视图序，结果会跳序。此处先把视图顺序固化到 order，
   * 让后续 reorder 在与视图一致的数组上执行。
   */
  snapshotOrder: (displayedIds: string[]) => Promise<void>;

  // === 归档 / 历史记录 ===
  /** 恢复归档事项（重新回到当前项目 todos） */
  restoreTodo: (id: string) => Promise<void>;
  /** 永久删除归档事项（不可恢复） */
  permanentlyDelete: (id: string) => Promise<void>;
  /** 清空当前项目的归档 */
  emptyArchive: () => Promise<void>;

  // === 清理 ===
  /** 清空已完成（归档已完成的 todo） */
  clearCompleted: () => Promise<void>;
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
  detailTodoId: null,

  loadProject: async (projectId: string) => {
    const [todos, deletedTodos] = await Promise.all([
      data.getTodos(projectId),
      data.getDeletedTodos(projectId),
    ]);
    // 项目 ID 与列表必须在同一次发布中切换。否则 React 可能短暂渲染出
    // 「新项目标题 + 旧项目事项」，并被 AnimatePresence 误判为跨列表的逐项变更。
    set({
      currentProjectId: projectId,
      todos,
      deletedTodos,
      loading: false,
      selectedIds: new Set(),
    });
  },

  addTodo: async ({ title, description, priority = 'medium', plannedDate }) => {
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
      plannedDate,
      createdAt: now,
      updatedAt: now,
      order: maxOrder + RANK_STEP,
      pinned: false,
    };
    await data.insertTodo(newTodo);
    set({ todos: [...todos, newTodo] });
  },

  addTodosBulk: async (rawText, priority = 'medium', plannedDate) => {
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
        plannedDate,
        createdAt: now,
        updatedAt: now,
        order: (baseOrder += RANK_STEP),
        pinned: false,
      };
      return todo;
    });

    await data.insertTodos(newTodos);
    set({ todos: [...todos, ...newTodos] });
  },

  updateTodo: async (id, updates) => {
    const { todos } = get();
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;

    const updatedTodo: Todo = {
      ...todo,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await data.updateTodo(updatedTodo);
    set({ todos: todos.map((t) => (t.id === id ? updatedTodo : t)) });
  },

  deleteTodo: async (id) => {
    const { todos } = get();
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;

    const [deletedTodo] = await data.archiveTodos([todo]);

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

  toggleTodo: async (id) => {
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
    await data.updateTodo(updatedTodo);
    set({ todos: todos.map((t) => (t.id === id ? updatedTodo : t)) });
  },

  moveTodo: async (id, projectId) => {
    const { todos, currentProjectId } = get();
    const todo = todos.find((t) => t.id === id);
    if (!todo || todo.projectId === projectId) return;

    await data.moveTodoToProject(id, projectId);
    // 移到非当前项目：从当前列表移除（在新项目 loadProject 时才会出现），
    // 并关闭详情浮窗 —— 继续编辑已不属于当前视图的 todo 会让用户困惑。
    set({
      todos: todos.filter((t) => t.id !== id),
      detailTodoId: currentProjectId === projectId ? get().detailTodoId : null,
    });
  },

  openDetail: (id) => set({ detailTodoId: id }),
  closeDetail: () => set({ detailTodoId: null }),

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

  batchAction: async (action, priority) => {
    const { selectedIds, todos } = get();
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    switch (action) {
      case 'complete': {
        const now = new Date().toISOString();
        const updated = todos.map((t) =>
          selectedIds.has(t.id)
            ? {
                ...t,
                completed: true,
                completedAt: now,
                updatedAt: now,
              }
            : t,
        );
        await data.batchUpdateTodos(ids, { completed: true, completedAt: now });
        set({ todos: updated, selectedIds: new Set() });
        break;
      }
      case 'uncomplete': {
        const now = new Date().toISOString();
        const updated = todos.map((t) =>
          selectedIds.has(t.id)
            ? {
                ...t,
                completed: false,
                completedAt: undefined,
                updatedAt: now,
              }
            : t,
        );
        await data.batchUpdateTodos(ids, { completed: false });
        set({ todos: updated, selectedIds: new Set() });
        break;
      }
      case 'delete': {
        const toDelete = todos.filter((t) => selectedIds.has(t.id));
        const archived = await data.archiveTodos(toDelete);
        set({
          todos: todos.filter((t) => !selectedIds.has(t.id)),
          deletedTodos: [...archived, ...get().deletedTodos],
          selectedIds: new Set(),
        });
        break;
      }
      case 'setPriority': {
        if (!priority) return;
        const now = new Date().toISOString();
        const updated = todos.map((t) =>
          selectedIds.has(t.id) ? { ...t, priority, updatedAt: now } : t,
        );
        await data.batchUpdateTodos(ids, { priority });
        set({ todos: updated, selectedIds: new Set() });
        break;
      }
    }
  },

  reorderTodos: async (sourceId, targetId) => {
    const { todos } = get();
    if (sourceId === targetId) return;

    const sourceIdx = todos.findIndex((t) => t.id === sourceId);
    const targetIdx = todos.findIndex((t) => t.id === targetId);
    if (sourceIdx === -1 || targetIdx === -1) return;

    const reordered = await data.moveTodoRank(get().currentProjectId, sourceId, targetId);
    set({ todos: reordered });
  },

  snapshotOrder: async (displayedIds: string[]) => {
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
    const reorderedIds = [...displayed, ...rest].map((t) => t.id);
    await data.reorderTodos(get().currentProjectId, reorderedIds);
    const sourceById = new Map(todos.map((t) => [t.id, t]));
    set({
      todos: reorderedIds.map((id, idx) => {
        const t = sourceById.get(id)!;
        return { ...t, order: (idx + 1) * RANK_STEP };
      }),
    });
  },

  restoreTodo: async (id) => {
    await data.restoreTodo(id);
    const [todos, deletedTodos] = await Promise.all([
      data.getTodos(get().currentProjectId),
      data.getDeletedTodos(get().currentProjectId),
    ]);
    set({ todos, deletedTodos });
  },

  permanentlyDelete: async (id) => {
    await data.permanentlyDelete(id);
    set({ deletedTodos: get().deletedTodos.filter((t) => t.id !== id) });
  },

  emptyArchive: async () => {
    await data.emptyArchive(get().currentProjectId);
    set({ deletedTodos: [] });
  },

  clearCompleted: async () => {
    const { todos } = get();
    const completed = todos.filter((t) => t.completed);
    const archived = await data.archiveTodos(completed);

    set({
      todos: todos.filter((t) => !t.completed),
      deletedTodos: [...archived, ...get().deletedTodos],
    });
  },
}));
