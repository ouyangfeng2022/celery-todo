/**
 * @file 应用数据上下文
 * @description 移动端唯一数据源：expo-sqlite 仓储 + 项目/事项状态 + 写操作。
 *              屏幕组件只消费这里暴露的 state/actions，不直接触碰仓储。
 *              移动端数据库与桌面端互不相通（无云同步，各设备独立）。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Repositories, TodoDto, TodoPriority } from '@celery/data';
import { createExpoSqliteRepositories } from '../data/expo-sqlite-repositories';
import type { ThemeName } from '../theme';

/** 项目在 UI 层的形状（桌面 ProjectDto + 计数聚合）。 */
export interface ProjectView {
  id: string;
  name: string;
  kind: 'user' | 'inbox' | 'weekly';
  activeCount: number;
}

interface AppDataValue {
  ready: boolean;
  theme: ThemeName;
  setTheme: (name: ThemeName) => void;
  projects: ProjectView[];
  currentProjectId: string;
  currentProject: ProjectView | null;
  switchProject: (id: string) => void;
  /** 当前项目事项（manual 序） */
  todos: TodoDto[];
  /** 手动排序提交 */
  reorder: (orderedIds: string[]) => Promise<void>;
  addTodo: (title: string, priority?: TodoPriority) => Promise<void>;
  toggleTodo: (id: string) => Promise<void>;
  archiveTodo: (id: string) => Promise<void>;
  pinTodo: (id: string, pinned: boolean) => Promise<void>;
  setPriority: (id: string, priority: TodoPriority) => Promise<void>;
  moveTodo: (id: string, projectId: string) => Promise<void>;
  /** 全量事项（计划/搜索页用；进入相应页时拉取） */
  allTodos: TodoDto[];
  refreshAllTodos: () => Promise<void>;
  search: (term: string) => Promise<TodoDto[]>;
}

const AppDataContext = createContext<AppDataValue | null>(null);

const repos: Repositories = createExpoSqliteRepositories();

/** 抽干分页（移动端量级：单项目数千行以内）。 */
async function drainTodos(projectId: string | null): Promise<TodoDto[]> {
  const out: TodoDto[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 50; i++) {
    const page = await repos.todos.page({
      projectId,
      filter: 'all',
      priority: null,
      plannedFrom: null,
      plannedTo: null,
      sort: 'manual',
      limit: 200,
      cursor,
    });
    out.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return out;
}

async function loadProjects(): Promise<ProjectView[]> {
  const list = await repos.projects.list();
  const views: ProjectView[] = [];
  for (const p of list) {
    const counts = await repos.todos.counts(p.id);
    views.push({ id: p.id, name: p.name, kind: p.kind, activeCount: counts.active });
  }
  return views;
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [theme, setThemeState] = useState<ThemeName>('light');
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState('');
  const [todos, setTodos] = useState<TodoDto[]>([]);
  const [allTodos, setAllTodos] = useState<TodoDto[]>([]);

  const refreshProjects = useCallback(async () => {
    const views = await loadProjects();
    setProjects(views);
    return views;
  }, []);

  const refreshTodos = useCallback(async (projectId: string) => {
    if (!projectId) {
      setTodos([]);
      return;
    }
    setTodos(await drainTodos(projectId));
  }, []);

  const refreshAllTodos = useCallback(async () => {
    setAllTodos(await drainTodos(null));
  }, []);

  // 首启：读主题 + 确保收集箱 + 激活第一个项目
  useEffect(() => {
    void (async () => {
      try {
        const stored = await repos.settings.get('theme');
        if (stored === 'dark' || stored === 'celery' || stored === 'light') {
          setThemeState(stored);
        }
      } catch {
        /* 首次启动无设置 */
      }
      const views = await refreshProjects();
      const first = views[0]?.id ?? '';
      setCurrentProjectId(first);
      await refreshTodos(first);
      setReady(true);
    })();
  }, [refreshProjects, refreshTodos]);

  const setTheme = useCallback((name: ThemeName) => {
    setThemeState(name);
    void repos.settings.set('theme', name).catch(() => {});
  }, []);

  const switchProject = useCallback(
    (id: string) => {
      setCurrentProjectId(id);
      void refreshTodos(id);
    },
    [refreshTodos],
  );

  const addTodo = useCallback(
    async (title: string, priority: TodoPriority = 'medium') => {
      if (!currentProjectId) return;
      // 追加语义：时间戳毫秒恒排尾部（与 CLI 同策略）
      const rank = Date.now();
      await repos.todos.create({
        id: crypto.randomUUID(),
        projectId: currentProjectId,
        title,
        description: null,
        priority,
        plannedDate: null,
        pinned: false,
        rank,
      });
      await Promise.all([refreshTodos(currentProjectId), refreshProjects()]);
    },
    [currentProjectId, refreshProjects, refreshTodos],
  );

  const toggleTodo = useCallback(
    async (id: string) => {
      const target = todos.find((t) => t.id === id) ?? allTodos.find((t) => t.id === id);
      if (!target) return;
      await repos.todos.update(id, { completed: !target.completed });
      await Promise.all([refreshTodos(currentProjectId), refreshProjects()]);
    },
    [todos, allTodos, currentProjectId, refreshProjects, refreshTodos],
  );

  const archiveTodo = useCallback(
    async (id: string) => {
      await repos.todos.archive([id]);
      await Promise.all([refreshTodos(currentProjectId), refreshProjects(), refreshAllTodos()]);
    },
    [currentProjectId, refreshProjects, refreshTodos, refreshAllTodos],
  );

  const pinTodo = useCallback(
    async (id: string, pinned: boolean) => {
      await repos.todos.update(id, { pinned });
      await Promise.all([refreshTodos(currentProjectId), refreshAllTodos()]);
    },
    [currentProjectId, refreshTodos, refreshAllTodos],
  );

  const setPriority = useCallback(
    async (id: string, priority: TodoPriority) => {
      await repos.todos.update(id, { priority });
      await Promise.all([refreshTodos(currentProjectId), refreshAllTodos()]);
    },
    [currentProjectId, refreshTodos, refreshAllTodos],
  );

  const moveTodo = useCallback(
    async (id: string, projectId: string) => {
      await repos.todos.move({ ids: [id], targetProjectId: projectId });
      await Promise.all([refreshTodos(currentProjectId), refreshProjects(), refreshAllTodos()]);
    },
    [currentProjectId, refreshProjects, refreshTodos, refreshAllTodos],
  );

  const reorder = useCallback(
    async (orderedIds: string[]) => {
      if (!currentProjectId) return;
      await repos.todos.reorder({ projectId: currentProjectId, orderedIds });
      await refreshTodos(currentProjectId);
    },
    [currentProjectId, refreshTodos],
  );

  const search = useCallback(async (term: string) => {
    const t = term.trim();
    if (!t) return [];
    const out: TodoDto[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 5; i++) {
      const page = await repos.todos.search({
        term: t,
        projectId: null,
        completed: null,
        limit: 200,
        cursor,
      });
      out.push(...page.items);
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    return out;
  }, []);

  const value = useMemo<AppDataValue>(
    () => ({
      ready,
      theme,
      setTheme,
      projects,
      currentProjectId,
      currentProject: projects.find((p) => p.id === currentProjectId) ?? null,
      switchProject,
      todos,
      reorder,
      addTodo,
      toggleTodo,
      archiveTodo,
      pinTodo,
      setPriority,
      moveTodo,
      allTodos,
      refreshAllTodos,
      search,
    }),
    [
      ready,
      theme,
      setTheme,
      projects,
      currentProjectId,
      switchProject,
      todos,
      reorder,
      addTodo,
      toggleTodo,
      archiveTodo,
      pinTodo,
      setPriority,
      moveTodo,
      allTodos,
      refreshAllTodos,
      search,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData 必须在 AppDataProvider 内使用');
  return ctx;
}
