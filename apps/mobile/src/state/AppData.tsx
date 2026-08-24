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
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  ArchivedTodoDto,
  Repositories,
  TodoDto,
  TodoFilter,
  TodoPriority,
  TodoSort,
  V3ExportFile,
} from '@celery/data';
import { V3_EXPORT_FORMAT_VERSION, V3_FORMAT_ID } from '@celery/data';
import Constants from 'expo-constants';
import {
  createExpoSqliteRepositories,
  uuid,
  type MobileRepositories,
} from '../data/expo-sqlite-repositories';
import type { ThemeName } from '../theme';
import {
  createTemplateFromProject,
  formatLocalDate,
  instantiateTemplate,
  type TodoTemplate,
} from '@celery/core';
import { toCoreProject, toCoreTodo } from '../utils/coreAdapter';

/** 项目在 UI 层的形状（桌面 ProjectDto 关键字段 + 计数聚合）。 */
export interface ProjectView {
  id: string;
  name: string;
  kind: 'user' | 'inbox' | 'weekly';
  color: string | null;
  rank: number;
  activeCount: number;
}

interface AppDataValue {
  ready: boolean;
  /** 初始化失败原因（兜底展示，避免无限卡在"正在初始化"） */
  initError: string | null;
  theme: ThemeName;
  setTheme: (name: ThemeName) => void;
  projects: ProjectView[];
  currentProjectId: string;
  currentProject: ProjectView | null;
  switchProject: (id: string) => void;
  /** 新建项目并切换过去 */
  createProject: (name: string) => Promise<void>;
  renameProject: (id: string, name: string) => Promise<void>;
  /** 永久删除项目（其活跃事项先带项目名快照归档，与桌面端一致） */
  deleteProject: (id: string) => Promise<void>;
  /** 调整项目顺序（收集箱固定置顶不参与，与桌面端一致） */
  reorderProjects: (orderedIds: string[]) => Promise<void>;
  /** 当前项目事项（按当前排序/过滤拉取） */
  todos: TodoDto[];
  /** 列表排序 / 状态过滤（按项目持久化：settings 键 sort.<pid> / filter.<pid>，与桌面端同名同义） */
  todoSort: TodoSort;
  todoFilter: TodoFilter;
  setTodoSort: (sort: TodoSort) => void;
  setTodoFilter: (filter: TodoFilter) => void;
  /** 手动排序提交 */
  reorder: (orderedIds: string[]) => Promise<void>;
  addTodo: (title: string, priority?: TodoPriority, plannedDate?: string | null) => Promise<void>;
  toggleTodo: (id: string) => Promise<void>;
  archiveTodo: (id: string) => Promise<void>;
  pinTodo: (id: string, pinned: boolean) => Promise<void>;
  setPriority: (id: string, priority: TodoPriority) => Promise<void>;
  moveTodo: (id: string, projectId: string) => Promise<void>;
  /** 设置/清除计划日期（null = 清除）；计划页分桶随之变化 */
  setPlannedDate: (id: string, plannedDate: string | null) => Promise<void>;
  /** 编辑标题/描述；标题 trim 后为空时忽略标题改动（描述空串存 null） */
  updateTodoContent: (id: string, patch: { title?: string; description?: string }) => Promise<void>;
  /** 批量：设完成/取消完成（completedAt 由仓储维护） */
  batchSetCompleted: (ids: string[], completed: boolean) => Promise<void>;
  /** 批量：设优先级 */
  batchSetPriority: (ids: string[], priority: TodoPriority) => Promise<void>;
  /** 批量：归档 */
  archiveTodos: (ids: string[]) => Promise<void>;
  /** 全量事项（计划/搜索页用；进入相应页时拉取） */
  allTodos: TodoDto[];
  refreshAllTodos: () => Promise<void>;
  search: (term: string) => Promise<TodoDto[]>;
  /** 已归档事项（游标增量加载；term 下推 SQL LIKE 过滤标题/描述） */
  archived: ArchivedTodoDto[];
  /** true = 后续无更多页 */
  archivedExhausted: boolean;
  /** reset=true 从头加载（term 为本次过滤词）；false 续拉下一页 */
  loadArchived: (reset?: boolean, term?: string | null) => Promise<void>;
  /** 一次性抽干全部归档（统计页用；重置过滤词，加载完置 exhausted） */
  loadAllArchived: () => Promise<void>;
  /** 恢复归档事项回原项目（原项目已删时回收集箱） */
  restoreArchivedTodo: (id: string) => Promise<void>;
  purgeArchivedTodo: (id: string) => Promise<void>;
  clearArchived: () => Promise<void>;
  /** 组装 v3 备份文件（项目/事项/归档/设置全量快照；文件落盘与分享由调用方做） */
  buildV3Export: () => Promise<V3ExportFile>;
  /** v3 备份全量导入（单事务清库重灌）；完成后重载主题/项目/列表 */
  importBackup: (file: V3ExportFile) => Promise<void>;
  /** 项目模板（settings 键 customTemplates，与桌面端同构） */
  templates: TodoTemplate[];
  /** 把项目未完成事项存为模板（同名替换）；无可存事项时抛错 */
  saveTemplate: (projectId: string, name: string) => Promise<void>;
  /** 从模板新建项目（日期偏移以今天为起点）并切换过去 */
  createProjectFromTemplate: (templateId: string) => Promise<void>;
  deleteTemplate: (templateId: string) => Promise<void>;
}

const AppDataContext = createContext<AppDataValue | null>(null);

const repos: MobileRepositories = createExpoSqliteRepositories();

/** 抽干分页（移动端量级：单项目数千行以内）。 */
async function drainTodos(
  projectId: string | null,
  sort: TodoSort = 'created-desc',
  filter: TodoFilter = 'all',
): Promise<TodoDto[]> {
  const out: TodoDto[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 50; i++) {
    const page = await repos.todos.page({
      projectId,
      filter,
      priority: null,
      plannedFrom: null,
      plannedTo: null,
      sort,
      limit: 200,
      cursor,
    });
    out.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return out;
}

/** 抽干归档分页（备份导出用）。 */
async function drainArchived(): Promise<ArchivedTodoDto[]> {
  const out: ArchivedTodoDto[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 100; i++) {
    const page = await repos.todos.archivedPage({
      projectId: null,
      term: null,
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
    views.push({
      id: p.id,
      name: p.name,
      kind: p.kind,
      color: p.color,
      rank: p.rank,
      activeCount: counts.active,
    });
  }
  return views;
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [theme, setThemeState] = useState<ThemeName>('light');
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState('');
  const [todos, setTodos] = useState<TodoDto[]>([]);
  const [todoSort, setTodoSortState] = useState<TodoSort>('created-desc');
  const [todoFilter, setTodoFilterState] = useState<TodoFilter>('all');
  const [allTodos, setAllTodos] = useState<TodoDto[]>([]);
  const [archived, setArchived] = useState<ArchivedTodoDto[]>([]);
  const [archivedExhausted, setArchivedExhausted] = useState(true);
  const [templates, setTemplates] = useState<TodoTemplate[]>([]);
  // 归档游标与过滤词跨「续拉」保留在 ref（不触发重渲染）
  const archivedCursorRef = useRef<string | null>(null);
  const archivedTermRef = useRef<string | null>(null);

  const refreshProjects = useCallback(async () => {
    const views = await loadProjects();
    setProjects(views);
    return views;
  }, []);

  const refreshTodos = useCallback(
    async (projectId: string, sort: TodoSort = todoSort, filter: TodoFilter = todoFilter) => {
      if (!projectId) {
        setTodos([]);
        return;
      }
      setTodos(await drainTodos(projectId, sort, filter));
    },
    [todoSort, todoFilter],
  );

  const refreshAllTodos = useCallback(async () => {
    setAllTodos(await drainTodos(null));
  }, []);

  // ============ 项目模板（settings 键 customTemplates，JSON 数组） ============

  const refreshTemplates = useCallback(async () => {
    try {
      const raw = await repos.settings.get('customTemplates');
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      // 脏值（非数组/结构不符）一律回退空，不让单个坏值拖垮启动
      setTemplates(Array.isArray(parsed) ? (parsed as TodoTemplate[]) : []);
    } catch {
      setTemplates([]);
    }
  }, []);

  /** 激活项目：载入该项目持久化的排序/过滤（脏值回退默认）再拉列表。 */
  const activateProject = useCallback(
    async (id: string) => {
      let sort: TodoSort = 'created-desc';
      let filter: TodoFilter = 'all';
      try {
        const [s, f] = await Promise.all([
          repos.settings.get(`sort.${id}`),
          repos.settings.get(`filter.${id}`),
        ]);
        if (s === 'created-desc' || s === 'priority' || s === 'manual') sort = s;
        if (f === 'all' || f === 'active' || f === 'completed') filter = f;
      } catch {
        /* 该项目无持久化设置 */
      }
      setTodoSortState(sort);
      setTodoFilterState(filter);
      setCurrentProjectId(id);
      await refreshTodos(id, sort, filter);
    },
    [refreshTodos],
  );

  // 首启：读主题 + 确保收集箱（与桌面端同语义，全新安装即可直接添加事项）
  // + 激活第一个项目
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
      try {
        await repos.projects.ensureInbox();
        const views = await refreshProjects();
        const first = views[0]?.id ?? '';
        await activateProject(first);
        void refreshTemplates();
        setReady(true);
      } catch (e) {
        setInitError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [refreshProjects, activateProject, refreshTemplates]);

  const setTheme = useCallback((name: ThemeName) => {
    setThemeState(name);
    void repos.settings.set('theme', name).catch(() => {});
  }, []);

  const switchProject = useCallback(
    (id: string) => {
      void activateProject(id);
    },
    [activateProject],
  );

  const createProject = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const created = await repos.projects.create({
        id: uuid(),
        name: trimmed,
        kind: 'user',
        color: null,
      });
      await refreshProjects();
      await activateProject(created.id);
    },
    [refreshProjects, activateProject],
  );

  const renameProject = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await repos.projects.update(id, { name: trimmed });
      await refreshProjects();
    },
    [refreshProjects],
  );

  const deleteProject = useCallback(
    async (id: string) => {
      await repos.projects.deletePermanently(id);
      const views = await refreshProjects();
      if (currentProjectId === id) {
        const next = views[0]?.id ?? '';
        await activateProject(next);
      }
      await refreshAllTodos();
    },
    [currentProjectId, refreshProjects, activateProject, refreshAllTodos],
  );

  const reorderProjects = useCallback(
    async (orderedIds: string[]) => {
      if (orderedIds.length === 0) return;
      await repos.projects.reorder({ orderedIds });
      await refreshProjects();
    },
    [refreshProjects],
  );

  const addTodo = useCallback(
    async (title: string, priority: TodoPriority = 'medium', plannedDate: string | null = null) => {
      if (!currentProjectId) return;
      // 追加语义：时间戳毫秒恒排尾部（与 CLI 同策略）
      const rank = Date.now();
      await repos.todos.create({
        id: uuid(),
        projectId: currentProjectId,
        title,
        description: null,
        priority,
        plannedDate,
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

  const setPlannedDate = useCallback(
    async (id: string, plannedDate: string | null) => {
      await repos.todos.update(id, { plannedDate });
      await Promise.all([refreshTodos(currentProjectId), refreshAllTodos()]);
    },
    [currentProjectId, refreshTodos, refreshAllTodos],
  );

  const updateTodoContent = useCallback(
    async (id: string, patch: { title?: string; description?: string }) => {
      const next: { title?: string; description?: string | null } = {};
      if (patch.title !== undefined && patch.title.trim()) next.title = patch.title.trim();
      if (patch.description !== undefined) {
        next.description = patch.description.trim() ? patch.description : null;
      }
      if (!next.title && next.description === undefined) return;
      await repos.todos.update(id, next);
      await Promise.all([refreshTodos(currentProjectId), refreshAllTodos()]);
    },
    [currentProjectId, refreshTodos, refreshAllTodos],
  );

  // ============ 批量操作（多选模式） ============

  const batchSetCompleted = useCallback(
    async (ids: string[], completed: boolean) => {
      if (ids.length === 0) return;
      await repos.todos.batchUpdate({ ids, patch: { completed } });
      await Promise.all([refreshTodos(currentProjectId), refreshProjects(), refreshAllTodos()]);
    },
    [currentProjectId, refreshTodos, refreshProjects, refreshAllTodos],
  );

  const batchSetPriority = useCallback(
    async (ids: string[], priority: TodoPriority) => {
      if (ids.length === 0) return;
      await repos.todos.batchUpdate({ ids, patch: { priority } });
      await Promise.all([refreshTodos(currentProjectId), refreshAllTodos()]);
    },
    [currentProjectId, refreshTodos, refreshAllTodos],
  );

  const archiveTodos = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      await repos.todos.archive(ids);
      await Promise.all([refreshTodos(currentProjectId), refreshProjects(), refreshAllTodos()]);
    },
    [currentProjectId, refreshTodos, refreshProjects, refreshAllTodos],
  );

  const reorder = useCallback(
    async (orderedIds: string[]) => {
      if (!currentProjectId) return;
      await repos.todos.reorder({ projectId: currentProjectId, orderedIds });
      await refreshTodos(currentProjectId);
    },
    [currentProjectId, refreshTodos],
  );

  const setTodoSort = useCallback(
    (sort: TodoSort) => {
      setTodoSortState(sort);
      if (currentProjectId) {
        void repos.settings.set(`sort.${currentProjectId}`, sort).catch(() => {});
      }
      void refreshTodos(currentProjectId, sort, todoFilter);
    },
    [currentProjectId, todoFilter, refreshTodos],
  );

  const setTodoFilter = useCallback(
    (filter: TodoFilter) => {
      setTodoFilterState(filter);
      if (currentProjectId) {
        void repos.settings.set(`filter.${currentProjectId}`, filter).catch(() => {});
      }
      void refreshTodos(currentProjectId, todoSort, filter);
    },
    [currentProjectId, todoSort, refreshTodos],
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

  // ============ 归档历史（设置页「已归档事项」） ============

  const loadArchived = useCallback(async (reset?: boolean, term?: string | null) => {
    if (reset) {
      archivedCursorRef.current = null;
      if (term !== undefined) {
        const keyword = term?.trim() ?? '';
        archivedTermRef.current = keyword || null;
      }
    }
    // 续拉时没有游标 = 已抽干
    if (!reset && !archivedCursorRef.current) return;
    const page = await repos.todos.archivedPage({
      projectId: null,
      term: archivedTermRef.current,
      limit: 50,
      cursor: archivedCursorRef.current,
    });
    archivedCursorRef.current = page.nextCursor;
    setArchivedExhausted(page.nextCursor === null);
    setArchived((prev) => (reset ? page.items : [...prev, ...page.items]));
  }, []);

  const restoreArchivedTodo = useCallback(
    async (id: string) => {
      // 原项目被删时仓储要求 fallback，收集箱首启必有
      const fallback = projects.find((p) => p.kind === 'inbox')?.id ?? null;
      await repos.todos.restoreArchived([id], fallback);
      await Promise.all([
        refreshTodos(currentProjectId),
        refreshProjects(),
        refreshAllTodos(),
        loadArchived(true),
      ]);
    },
    [projects, currentProjectId, refreshTodos, refreshProjects, refreshAllTodos, loadArchived],
  );

  const loadAllArchived = useCallback(async () => {
    archivedCursorRef.current = null;
    archivedTermRef.current = null;
    const all: ArchivedTodoDto[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 100; i++) {
      const page = await repos.todos.archivedPage({
        projectId: null,
        term: null,
        limit: 200,
        cursor,
      });
      all.push(...page.items);
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    archivedCursorRef.current = cursor;
    setArchivedExhausted(cursor === null);
    setArchived(all);
  }, []);

  const purgeArchivedTodo = useCallback(async (id: string) => {
    await repos.todos.purgeArchived([id]);
    setArchived((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearArchived = useCallback(async () => {
    await repos.todos.purgeAllArchived();
    archivedCursorRef.current = null;
    archivedTermRef.current = null;
    setArchived([]);
    setArchivedExhausted(true);
  }, []);

  // ============ 备份（v3 JSON，celery-todo/v3 格式） ============

  const buildV3Export = useCallback(async (): Promise<V3ExportFile> => {
    // 只导出活跃项目：已删项目由归档行的 projectName 快照承载（两端同语义）
    const [projects, todos, archivedTodos, settings] = await Promise.all([
      repos.projects.list(),
      drainTodos(null),
      drainArchived(),
      repos.settings.all(),
    ]);
    return {
      format: V3_FORMAT_ID,
      formatVersion: V3_EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: Constants.expoConfig?.version ?? '0.0.0',
      projects,
      todos,
      archivedTodos,
      settings,
    };
  }, []);

  const importBackup = useCallback(
    async (file: V3ExportFile) => {
      repos.replaceAllV3(file);
      // 备份的设置里可能带不同的主题键
      try {
        const stored = await repos.settings.get('theme');
        if (stored === 'dark' || stored === 'celery' || stored === 'light') {
          setThemeState(stored);
        }
      } catch {
        /* 备份无主题键 */
      }
      const views = await refreshProjects();
      await activateProject(views[0]?.id ?? '');
      await Promise.all([refreshAllTodos(), loadArchived(true, null), refreshTemplates()]);
    },
    [refreshProjects, activateProject, refreshAllTodos, loadArchived, refreshTemplates],
  );

  const saveTemplate = useCallback(
    async (projectId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const view = projects.find((p) => p.id === projectId);
      if (!view) return;
      // core 纯函数：默认只收未完成事项、收集箱抛错、无可存事项抛错
      const todos = await drainTodos(projectId);
      const template = createTemplateFromProject(
        toCoreProject(view),
        todos.map(toCoreTodo),
        trimmed,
      );
      const next = [...templates.filter((t) => t.name !== trimmed), template];
      await repos.settings.set('customTemplates', JSON.stringify(next));
      setTemplates(next);
    },
    [projects, templates],
  );

  const createProjectFromTemplate = useCallback(
    async (templateId: string) => {
      const template = templates.find((t) => t.id === templateId);
      if (!template) return;
      // 以今天为起始日重放模板的日期偏移（无偏移项不受影响）
      const { project, todos } = instantiateTemplate(
        template,
        template.projectName,
        formatLocalDate(new Date()),
      );
      await repos.projects.create({
        id: project.id,
        name: project.name,
        kind: 'user',
        color: project.color ?? null,
      });
      if (todos.length > 0) {
        await repos.todos.createBulk(
          todos.map((t) => ({
            id: t.id,
            projectId: t.projectId,
            title: t.title,
            description: t.description ?? null,
            priority: t.priority,
            plannedDate: t.plannedDate ?? null,
            pinned: t.pinned,
            rank: t.order,
          })),
        );
      }
      await refreshProjects();
      await activateProject(project.id);
    },
    [templates, refreshProjects, activateProject],
  );

  const deleteTemplate = useCallback(
    async (templateId: string) => {
      const next = templates.filter((t) => t.id !== templateId);
      await repos.settings.set('customTemplates', JSON.stringify(next));
      setTemplates(next);
    },
    [templates],
  );

  const value = useMemo<AppDataValue>(
    () => ({
      ready,
      initError,
      theme,
      setTheme,
      projects,
      currentProjectId,
      currentProject: projects.find((p) => p.id === currentProjectId) ?? null,
      switchProject,
      createProject,
      renameProject,
      deleteProject,
      reorderProjects,
      todos,
      todoSort,
      todoFilter,
      setTodoSort,
      setTodoFilter,
      reorder,
      addTodo,
      toggleTodo,
      archiveTodo,
      pinTodo,
      setPriority,
      moveTodo,
      setPlannedDate,
      updateTodoContent,
      batchSetCompleted,
      batchSetPriority,
      archiveTodos,
      allTodos,
      refreshAllTodos,
      search,
      archived,
      archivedExhausted,
      loadArchived,
      loadAllArchived,
      restoreArchivedTodo,
      purgeArchivedTodo,
      clearArchived,
      buildV3Export,
      importBackup,
      templates,
      saveTemplate,
      createProjectFromTemplate,
      deleteTemplate,
    }),
    [
      ready,
      initError,
      theme,
      setTheme,
      projects,
      currentProjectId,
      switchProject,
      createProject,
      renameProject,
      deleteProject,
      reorderProjects,
      todos,
      todoSort,
      todoFilter,
      setTodoSort,
      setTodoFilter,
      reorder,
      addTodo,
      toggleTodo,
      archiveTodo,
      pinTodo,
      setPriority,
      moveTodo,
      setPlannedDate,
      updateTodoContent,
      batchSetCompleted,
      batchSetPriority,
      archiveTodos,
      allTodos,
      refreshAllTodos,
      search,
      archived,
      archivedExhausted,
      loadArchived,
      loadAllArchived,
      restoreArchivedTodo,
      purgeArchivedTodo,
      clearArchived,
      buildV3Export,
      importBackup,
      templates,
      saveTemplate,
      createProjectFromTemplate,
      deleteTemplate,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData 必须在 AppDataProvider 内使用');
  return ctx;
}
