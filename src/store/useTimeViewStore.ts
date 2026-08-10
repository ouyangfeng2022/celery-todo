/** 跨项目时间视图状态。数据库仍是唯一真值，Store 只缓存当前快照。 */
import { create } from 'zustand';
import type { FilterType, Priority, Project, Todo } from '../types';
import * as data from '../utils/dataGateway';
import { generateId, splitBulkTitles } from '../utils/helpers';
import { classifyPlannedDate, type TimeBucket } from '../utils/planning';

export const TIME_BUCKET_LABELS: Record<TimeBucket, string> = {
  replan: '待重新安排',
  today: '今天',
  tomorrow: '明天',
  week: '本周其余',
  later: '以后',
  unscheduled: '未安排',
};

interface TimeViewState {
  allTodos: Todo[];
  bucket: TimeBucket;
  filter: FilterType;
  loading: boolean;
  load: () => Promise<void>;
  setBucket: (bucket: TimeBucket) => void;
  setFilter: (filter: FilterType) => void;
  add: (params: {
    rawTitle: string;
    priority?: Priority;
    description?: string;
    plannedDate?: string;
    projectId?: string;
  }) => Promise<Project>;
  update: (id: string, updates: Partial<Todo>) => Promise<void>;
  toggle: (id: string) => Promise<void>;
  archive: (id: string) => Promise<void>;
  move: (id: string, projectId: string) => Promise<void>;
}

export const useTimeViewStore = create<TimeViewState>((set, get) => ({
  allTodos: [],
  bucket: 'today',
  filter: 'active',
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      set({ allTodos: await data.getAllTodos() });
    } finally {
      set({ loading: false });
    }
  },

  setBucket: (bucket) => set({ bucket, filter: bucket === 'replan' ? 'active' : get().filter }),
  setFilter: (filter) => set({ filter }),

  add: async ({ rawTitle, priority = 'medium', description, plannedDate, projectId }) => {
    const selectedProject = projectId ? await data.getProject(projectId) : null;
    const titles = splitBulkTitles(rawTitle);
    const now = new Date().toISOString();
    const existing = selectedProject
      ? get().allTodos.filter((todo) => todo.projectId === selectedProject.id)
      : [];
    let order = existing.length ? Math.max(...existing.map((todo) => todo.order)) : 0;
    let todos: Todo[] = titles.map((title, index) => ({
      id: generateId(),
      projectId: selectedProject?.id ?? '',
      title,
      description: index === 0 ? description?.trim() || undefined : undefined,
      completed: false,
      priority,
      plannedDate,
      createdAt: now,
      updatedAt: now,
      order: (order += 1024),
      pinned: false,
    }));
    const project = selectedProject ?? (await data.insertTodosIntoInbox(todos));
    if (selectedProject) await data.insertTodos(todos);
    else todos = todos.map((todo) => ({ ...todo, projectId: project.id }));
    set({ allTodos: [...get().allTodos, ...todos] });
    return project;
  },

  update: async (id, updates) => {
    const todo = get().allTodos.find((item) => item.id === id);
    if (!todo) return;
    const updated = { ...todo, ...updates, updatedAt: new Date().toISOString() };
    await data.updateTodo(updated);
    set({ allTodos: get().allTodos.map((item) => (item.id === id ? updated : item)) });
  },

  toggle: async (id) => {
    const todo = get().allTodos.find((item) => item.id === id);
    if (!todo) return;
    const completed = !todo.completed;
    await get().update(id, {
      completed,
      completedAt: completed ? new Date().toISOString() : undefined,
    });
  },

  archive: async (id) => {
    const todo = get().allTodos.find((item) => item.id === id);
    if (!todo) return;
    await data.archiveTodos([todo]);
    set({ allTodos: get().allTodos.filter((item) => item.id !== id) });
  },

  move: async (id, projectId) => {
    const moved = await data.moveTodoToProject(id, projectId);
    set({ allTodos: get().allTodos.map((item) => (item.id === id ? moved : item)) });
  },
}));

export function selectTimeBucketTodos(state: TimeViewState): Todo[] {
  return state.allTodos
    .filter((todo) => classifyPlannedDate(todo.plannedDate, todo.completed) === state.bucket)
    .filter((todo) =>
      state.filter === 'active'
        ? !todo.completed
        : state.filter === 'completed'
          ? todo.completed
          : true,
    )
    .sort((a, b) => {
      const date = (a.plannedDate ?? '').localeCompare(b.plannedDate ?? '');
      if (date !== 0) return date;
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.order - b.order;
    });
}

export function selectTimeBucketCounts(todos: Todo[]): Record<TimeBucket, number> {
  const counts: Record<TimeBucket, number> = {
    replan: 0,
    today: 0,
    tomorrow: 0,
    week: 0,
    later: 0,
    unscheduled: 0,
  };
  for (const todo of todos) {
    if (todo.completed) continue;
    const bucket = classifyPlannedDate(todo.plannedDate, false);
    if (bucket) counts[bucket] += 1;
  }
  return counts;
}
