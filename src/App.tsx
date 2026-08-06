/**
 * @file App - 应用根组件
 * @description 组合所有组件，管理全局状态和布局
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';

import { useTodoStore } from './store/useTodoStore';
import { useProjectStore } from './store/useProjectStore';
import { useSettingsStore } from './store/useSettingsStore';

import { useTodos } from './hooks/useTodos';
import { useProjects } from './hooks/useProjects';
import { useFilter } from './hooks/useFilter';
import { useTheme } from './hooks/useTheme';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

import { Header } from './components/layout/Header';
import { ProjectSidebar } from './components/projects/ProjectSidebar';
import { AddTodoInput } from './components/todos/AddTodoInput';
import { FilterBar } from './components/filters/FilterBar';
import { StatsPanel } from './components/stats/StatsPanel';
import { TodoList } from './components/todos/TodoList';
import { BatchToolbar } from './components/todos/BatchToolbar';
import { SettingsPanel, type SettingsSectionId } from './components/settings/SettingsPanel';
import { ExportImageDialog } from './components/export/ExportImageDialog';
import { NoProjectsState } from './components/common/NoProjectsState';
import { AllDoneCelebration } from './components/common/AllDoneCelebration';
import { ArchiveNotice } from './components/common/ArchiveNotice';
import { FocusIcon } from './components/common/Icons';
import { Logo } from './components/common/Logo';

import { useAutoUpdate } from './hooks/useAutoUpdate';
import { useCliBridge } from './cli-bridge';

import * as db from './utils/database';
import { createCoalescedAsyncTask } from './utils/coalescedAsyncTask';
import {
  EXPORT_FORMAT_VERSION,
  exportAppAsJson,
  exportHistoryAsJson,
  exportProjectAsJson,
  parseImportData,
  todosToCsv,
} from './utils/export';
import { cn, downloadFile, readFileAsText } from './utils/helpers';
import type { DeletedTodo, FilterType, GlobalSearchResult, Priority, Project, Todo } from './types';

/**
 * 全部完成庆祝撒花：从屏幕两侧各发射一束粒子，克制、短促。
 * canvas-confetti 会自建并自行清理 canvas，无需手动管理。
 */
function fireCelebration() {
  const defaults = { spread: 70, startVelocity: 35, scalar: 0.9, ticks: 120, zIndex: 100 };
  confetti({ ...defaults, particleCount: 60, origin: { x: 0.2, y: 0.7 }, angle: 60 });
  confetti({ ...defaults, particleCount: 60, origin: { x: 0.8, y: 0.7 }, angle: 120 });
}

/**
 * 生成全局搜索结果摘要：返回命中字段（标题/描述）的片段而非占位文案。
 * 命中描述时截取关键词周边字符；仅命中标题时回退展示标题，让用户能看到匹配上下文。
 */
/**
 * 生成全局搜索结果摘要：描述命中时截取关键词周边片段；描述未命中但有内容时
 * 展示描述作为上下文；无描述时返回空串，由 SearchBar 隐藏该行，避免重复标题或占位文案。
 */
function extractMatchedText(todo: Todo, lowerKeyword: string): string {
  const description = todo.description?.trim();
  if (!description) return '';
  const descLower = description.toLowerCase();
  const idx = descLower.indexOf(lowerKeyword);
  if (idx === -1) return description;
  const start = Math.max(0, idx - 12);
  const end = Math.min(description.length, idx + lowerKeyword.length + 12);
  const snippet = description.slice(start, end);
  return start > 0 ? `…${snippet}` : snippet;
}

function App() {
  const [mainScrollElement, setMainScrollElement] = useState<HTMLElement | null>(null);
  // === 初始化数据库 ===
  const [dbReady, setDbReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>('general');
  const [newTodoFocusSignal, setNewTodoFocusSignal] = useState(0);
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
  const [globalSearch, setGlobalSearch] = useState('');
  const [todoFocusTarget, setTodoFocusTarget] = useState<{ id: string; signal: number } | null>(
    null,
  );
  // 专注模式下 AddTodoInput 默认隐藏，Ctrl+N 临时唤出；添加完成或 Esc 后回隐藏
  const [composerVisible, setComposerVisible] = useState(false);
  // 主区「请创建项目」按钮触发侧边栏新建输入框聚焦：递增值驱动 ProjectSidebar 的 effect
  const [createProjectSignal, setCreateProjectSignal] = useState(0);
  // 最近一次归档的 id：用于顶部提示的数量展示与「撤销」恢复。
  const [archiveNoticeIds, setArchiveNoticeIds] = useState<string[]>([]);
  // 从已归档事项页恢复后的反馈，项目名可作为返回原项目的入口。
  const [restoreNotice, setRestoreNotice] = useState<{
    count: number;
    projectId: string;
    projectName: string;
    filter: FilterType;
  } | null>(null);
  // 点击恢复提示的项目名后，待项目切换完成再应用对应状态筛选。
  const [restoreTargetFilter, setRestoreTargetFilter] = useState<{
    projectId: string;
    filter: FilterType;
  } | null>(null);

  // === Stores ===
  const settings = useSettingsStore();
  const focusMode = settings.focusMode;
  const { toggleTheme } = useTheme();
  const {
    projects,
    activeProjectId,
    activeProject,
    createProject,
    renameProject,
    deleteProject,
    switchProject,
    reorderProjects,
    loadProjects,
  } = useProjects();
  const {
    todos,
    deletedTodos,
    selectedIds,
    addTodo,
    updateTodo,
    deleteTodo,
    toggleTodo,
    toggleSelected,
    clearSelection,
    batchAction,
    clearCompleted,
    reorderTodos,
    snapshotOrder,
    restoreTodo,
    permanentlyDelete,
    emptyArchive,
  } = useTodos();

  // activeProjectId 先于 useEffect 中的 loadProject 更新。渲染端再做一次
  // projectId 约束，确保这一个提交里绝不会把上一项目的事项交给列表动画树。
  const activeProjectTodos = useMemo(
    () => todos.filter((todo) => todo.projectId === activeProjectId),
    [todos, activeProjectId],
  );

  // === 自动升级（仅桌面端） ===
  const {
    isDesktop: isAutoUpdateAvailable,
    status: updateStatus,
    updateInfo,
    progress: updateProgress,
    errorMsg: updateError,
    isNewlyAvailable,
    sidebarDismissed,
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
    acknowledgeUpdate,
    dismissSidebarUpdate,
  } = useAutoUpdate({ dbReady });

  // 更新入口不再唤出模态框：下载与重启状态固定显示在侧边栏底部。
  const handleUpdateAction = useCallback(() => {
    acknowledgeUpdate();
    if (updateStatus === 'available') downloadUpdate();
    if (updateStatus === 'downloaded' || updateStatus === 'dismissed') void quitAndInstall();
  }, [acknowledgeUpdate, downloadUpdate, quitAndInstall, updateStatus]);

  const openSettings = useCallback((section: SettingsSectionId = 'general') => {
    setSettingsSection(section);
    setSettingsOpen(true);
  }, []);

  const showArchiveNotice = useCallback((ids: string[]) => {
    if (ids.length > 0) setArchiveNoticeIds(ids);
  }, []);

  const handleUndoArchive = useCallback(() => {
    archiveNoticeIds.forEach(restoreTodo);
    setArchiveNoticeIds([]);
  }, [archiveNoticeIds, restoreTodo]);

  const handleRestoreFromHistory = useCallback(
    (todo: DeletedTodo) => {
      restoreTodo(todo.id);
      setArchiveNoticeIds([]);
      setRestoreNotice({
        count: 1,
        projectId: todo.projectId,
        projectName: projects.find((project) => project.id === todo.projectId)?.name ?? '原项目',
        filter: todo.completed ? 'completed' : 'active',
      });
    },
    [projects, restoreTodo],
  );

  // === CLI IPC 桥接（顶层挂载一次，监听主进程转发的 CLI 请求）===
  useCliBridge();

  // === 筛选 ===
  // overrideFilter 仅在全局搜索定位的瞬间视作 'all'，确保被用户当前筛选
  // （'active'/'completed'）隐藏的目标事项仍能渲染出来再高亮定位。
  const searchFocusOverride = todoFocusTarget ? ('all' as const) : null;
  const { filter, sort, filteredTodos, stats, changeFilter, changeSort } = useFilter(
    activeProjectTodos,
    activeProjectId,
    searchFocusOverride,
  );

  // 项目切换会让 useFilter 绑定新的 projectId；等两者对齐后再写入筛选，
  // 确保恢复已完成事项时进入「已完成」，未完成事项时进入「进行中」。
  useEffect(() => {
    if (!restoreTargetFilter || restoreTargetFilter.projectId !== activeProjectId) return;
    changeFilter(restoreTargetFilter.filter);
    setRestoreTargetFilter(null);
  }, [activeProjectId, changeFilter, restoreTargetFilter]);

  // === 全局事项搜索 ===
  // 当前项目 store 只缓存已打开项目；搜索直接读取正常事项表，确保跨项目结果完整。
  // 使用参数化 searchTodos 在 SQL 层 LIKE + LIMIT，避免每次按键拉全表。
  const globalSearchResults = useMemo<GlobalSearchResult[]>(() => {
    const keyword = globalSearch.trim();
    if (!dbReady || !keyword) return [];
    const lower = keyword.toLowerCase();
    const projectById = new Map(projects.map((project) => [project.id, project]));
    return db.searchTodos(keyword).flatMap((todo) => {
      const project = projectById.get(todo.projectId);
      if (!project) return [];
      return [{ todo, project, matchedText: extractMatchedText(todo, lower) }];
    });
    // todos / deletedTodos 是数据库内容变动的渲染信号；查询结果本身不直接引用它们。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbReady, globalSearch, projects, todos, deletedTodos]);

  const handleSelectGlobalSearchResult = useCallback(
    (result: GlobalSearchResult) => {
      setGlobalSearch('');
      switchProject(result.project.id);
      setTodoFocusTarget((current) => ({ id: result.todo.id, signal: (current?.signal ?? 0) + 1 }));
    },
    [switchProject],
  );

  // 定位高亮 1600ms 后清空 todoFocusTarget，连带解除 searchFocusOverride：
  // 否则 overrideFilter 会永久视作 'all'，FilterBar 不再反映用户原筛选。
  useEffect(() => {
    if (!todoFocusTarget) return;
    const timer = window.setTimeout(() => setTodoFocusTarget(null), 1700);
    return () => window.clearTimeout(timer);
  }, [todoFocusTarget]);

  // === 各项目未完成 todo 计数 ===
  // 侧边栏需要展示所有项目的未完成数，而 useTodoStore 只持有当前项目的 todos。
  // 聚合交给 SQLite，避免每次当前项目变动都把全表拉到 JS 再遍历。todos/deletedTodos
  // 仍作为数据库内容变动信号，驱动聚合结果刷新。
  // dbReady 守卫：useMemo 在首渲染即执行，此时 DB 尚未异步初始化完成，直接查询会抛错。
  const incompleteCounts = useMemo<Record<string, number>>(() => {
    if (!dbReady) return {};
    const counts: Record<string, number> = {};
    for (const p of projects) counts[p.id] = 0;
    Object.assign(counts, db.getIncompleteCountsByProject());
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- todos/deletedTodos 作为 store 变更信号，非 body 内依赖
  }, [projects, todos, deletedTodos, dbReady]);

  // === 全部完成庆祝 ===
  // 该项目有待办且全部已完成；stats 基于当前项目全量 todos（不受筛选器影响）。
  const allDone = stats.total > 0 && stats.active === 0;
  // 撒花触发条件（两层防重复）：
  //   1) prevAllDoneRef —— 防同一 mount 周期内反复重渲染时重复触发（上升边沿）。
  //   2) celebrated.<projectId> 持久化键（settings 表）—— 防重启/切走再切回时重复撒花。
  //      每个项目撒花一次；点击对号归档（handleAllDoneRestore）会重置该键，
  //      下次重新完成全部待办会再次庆祝。
  const prevAllDoneRef = useRef(false);
  useEffect(() => {
    const celebratedKey = activeProjectId ? `celebrated.${activeProjectId}` : '';
    const alreadyCelebrated = !!celebratedKey && db.getSetting(celebratedKey) === 'true';
    if (allDone && !prevAllDoneRef.current && !alreadyCelebrated) {
      fireCelebration();
      if (celebratedKey) db.setSetting(celebratedKey, 'true');
    }
    prevAllDoneRef.current = allDone;
  }, [allDone, activeProjectId]);

  // 点击「全部搞定」对号：归档本项目所有已完成项（进回收站），并重置该项目庆祝键，
  // 让下次重新完成全部待办时再次撒花。归档后 todos 清空 → allDone 回落 false →
  // 渲染切回 TodoList，因 filteredTodos 为空而自然显示「从一件小事开始」空状态。
  const handleAllDoneRestore = useCallback(() => {
    if (activeProjectId) {
      db.setSetting(`celebrated.${activeProjectId}`, 'false');
    }
    clearCompleted();
    showArchiveNotice(activeProjectTodos.filter((todo) => todo.completed).map((todo) => todo.id));
  }, [activeProjectId, activeProjectTodos, clearCompleted, showArchiveNotice]);

  // === 初始化 ===
  useEffect(() => {
    (async () => {
      await db.initDatabase();
      useSettingsStore.getState().loadSettings();
      useProjectStore.getState().loadProjects();
      // 启动时恢复上次激活的项目：
      //   1) 读持久化的 lastActiveProjectId，若该项目仍在列表中 → 恢复；
      //   2) 否则回退到列表第一个项目（若有）；
      //   3) 列表为空时保持初始 ''，主区显示「请创建项目」。
      // loadSettings 必须在 loadProjects 之前调用，这里才能拿到 lastActiveProjectId。
      const lastId = useSettingsStore.getState().lastActiveProjectId;
      const projects = useProjectStore.getState().projects;
      if (lastId && projects.some((p) => p.id === lastId)) {
        useProjectStore.getState().setActiveProject(lastId);
      } else if (projects.length > 0) {
        useProjectStore.getState().setActiveProject(projects[0].id);
      }
      const activeId = useProjectStore.getState().activeProjectId;
      useTodoStore.getState().loadProject(activeId);
      setDbReady(true);
    })();
  }, []);

  // === 跨窗口数据同步 ===
  // 贴图窗口是独立 renderer，各自维护一份 sql.js 内存库。任一窗口写盘后由
  // database.persistDatabase 触发 notifyDataChanged。Todo 局部变更带项目快照，
  // 可直接合并到本窗口 sql.js；复杂/并发写入和版本断档才重读完整内存库。
  // 注意：此处不能先 flushSave() 再 reload —— flushSave 会无条件把"本窗口内存库"
  // 整个写盘，而本窗口的内存库可能尚未看到对方的写（如贴图刚 toggle 完成的那条
  // 仍是旧值）。那样会用旧内存覆盖磁盘上对方刚写的更新，导致写-写冲突（例如
  // 贴图完成被主窗口回滚）。收到广播即意味着磁盘已是最新，直接 reload 即可；
  // 本窗口自己 scheduleSave 的 pending 写属于"旧内存"的一部分，正确语义是
  // 先让它在下一轮 debounce 落盘，或由 store action 的本地刷新兜底，不能在
  // 此处与本窗口内存对账。
  useEffect(() => {
    let disposed = false;
    let lastSeenVersion = 0;
    const sync = createCoalescedAsyncTask(async () => {
      await db.reloadDatabase();
      if (disposed) return;
      useSettingsStore.getState().loadSettings();
      useProjectStore.getState().loadProjects();
      // 用当前 activeProjectId（不是 settings.lastActiveProjectId，
      // 后者是上次启动的快照，这里要的是用户当前正在看的项目）
      useTodoStore.getState().loadProject(useProjectStore.getState().activeProjectId);
    });
    const off = window.electronAPI?.onDataChanged?.(({ version, shouldApply, patch }) => {
      const hasGap = lastSeenVersion !== 0 && version !== lastSeenVersion + 1;
      lastSeenVersion = version;
      if (!shouldApply) return;

      if (patch && !hasGap) {
        // Todo-only 变更可直接合并到本窗口 sql.js；无需读取并重建整个 SQLite 二进制。
        db.applyRemoteSyncPatch(patch);
        // 项目数组引用变化会刷新侧边栏计数；实际只做轻量 SQL 查询，不重载数据库。
        useProjectStore.getState().loadProjects();
        useTodoStore.getState().loadProject(useProjectStore.getState().activeProjectId);
        return;
      }
      // 复杂写入、并发写入或版本断档时以磁盘快照作为权威来源。
      sync.schedule();
    });
    return () => {
      disposed = true;
      sync.dispose();
      off?.();
    };
  }, []);

  // === 安装阶段勾选了"开机自启"时的同步 ===
  // 主进程已在 NSIS 安装时通过 app.setLoginItemSettings 写好注册表，
  // 通过 IPC 推送这个事实，这里把 settings.autoStart 同步进 DB + store，
  // 让设置面板的复选框与系统真实状态保持一致。事件是一次性的（主进程仅发一次）。
  useEffect(() => {
    if (!window.electronAPI?.onInstallOptionsAutoStart) return;
    const off = window.electronAPI.onInstallOptionsAutoStart((enabled) => {
      useSettingsStore.getState().setAutoStart(enabled);
    });
    return () => {
      off?.();
    };
  }, []);

  // === 项目切换时：持久化 + 重新加载 ===
  // 持久化拆出真值判断之外：删完最后一个项目时 activeProjectId 归空串也要写盘，
  // 否则下次启动会恢复一个已不存在的 id（虽有存在性校验兜底，但语义不清）。
  useEffect(() => {
    if (!dbReady) return;
    db.setSetting('lastActiveProjectId', activeProjectId);
    if (activeProjectId) {
      useTodoStore.getState().loadProject(activeProjectId);
      clearSelection();
    }
  }, [activeProjectId, dbReady, clearSelection]);

  // 唤出新建事项输入框并聚焦。供 Ctrl+N 快捷键与托盘「快速添加事项」共用：
  // 专注模式下 AddTodoInput 默认隐藏，需先把它唤出再触发聚焦信号。
  const focusNewTodo = useCallback(() => {
    if (focusMode) setComposerVisible(true);
    setNewTodoFocusSignal((n) => n + 1);
  }, [focusMode]);

  // 在指定项目下新建事项：先切换到该项目（AddTodoInput 通过 store 的 currentProjectId
  // 决定写入哪个项目），再唤出输入框。切换项目会触发主区重渲染，需等下一帧再聚焦输入框。
  const handleNewTodoInProject = useCallback(
    (projectId: string) => {
      switchProject(projectId);
      // 切换项目后聚焦信号要排到 loadProject 之后，故延迟一帧
      requestAnimationFrame(() => focusNewTodo());
    },
    [switchProject, focusNewTodo],
  );

  // === 键盘快捷键 ===
  useKeyboardShortcuts({
    onNewTodo: focusNewTodo,
    onSearch: () => {
      // 搜索入口位于侧边栏标题行；侧边栏收起时先展开，再打开并聚焦搜索。
      // 设置页打开时搜索结果在主页面 TodoList（被设置页浮层遮盖），故先关设置页，
      // 让搜索框与结果都在主页面语境可见。
      if (settingsOpen) setSettingsOpen(false);
      setSidebarOpen(true);
      setSearchFocusSignal((n) => n + 1);
    },
    onSave: () => {
      db.flushSave();
    },
    onToggleSidebar: () => {
      // 专注模式下侧边栏被隐藏，Ctrl+B 优先退出专注模式以露出侧边栏
      if (focusMode) {
        useSettingsStore.getState().setFocusMode(false);
        return;
      }
      setSidebarOpen((s) => !s);
    },
    onToggleTheme: toggleTheme,
    onFilterAll: () => changeFilter('all'),
    onFilterActive: () => changeFilter('active'),
    onFilterCompleted: () => changeFilter('completed'),
    onEscape: () => {
      clearSelection();
      setSettingsOpen(false);
      // 专注模式下 Esc 收起临时唤出的 AddTodoInput
      if (focusMode) setComposerVisible(false);
    },
  });

  // === 托盘「快速添加事项」===
  // tray.ts 在点击该菜单项时已 show+focus 主窗口，并发 'quick-add' 事件；
  // 这里订阅后走与 Ctrl+N 完全相同的聚焦逻辑（唤出输入框 + 触发聚焦信号）。
  useEffect(() => {
    const off = window.electronAPI?.onQuickAdd?.(() => {
      focusNewTodo();
    });
    return () => {
      off?.();
    };
  }, [focusNewTodo]);

  // === 导入导出 ===
  const handleExportProject = useCallback(
    (projectId: string) => {
      const project = projects.find((p) => p.id === projectId);
      if (!project) return;
      const projectTodos = db.getTodosByProject(projectId);
      const projectDeleted = db.getDeletedTodosByProject(projectId);
      const json = exportProjectAsJson(project, projectTodos, projectDeleted);
      downloadFile(json, `${project.name}-export.json`);
    },
    [projects],
  );

  const handleExportAll = useCallback(() => {
    const data = db.exportAllData();
    const json = exportAppAsJson(data);
    downloadFile(json, `celery-todo-backup-${new Date().toISOString().split('T')[0]}.json`);
  }, []);

  const handleExportCsv = useCallback(() => {
    const csv = todosToCsv(todos);
    downloadFile(csv, `todos-${activeProject?.name ?? 'export'}.csv`, 'text/csv;charset=utf-8');
  }, [todos, activeProject]);

  // 按项目导出 CSV：不依赖当前已加载的 todos，直接查指定项目，供设置页「导出项目」
  // 对话框使用（用户选的不一定是当前活跃项目）。
  const handleExportCsvForProject = useCallback(
    (projectId: string) => {
      const project = projects.find((p) => p.id === projectId);
      if (!project) return;
      const rows = db.getTodosByProject(projectId);
      const csv = todosToCsv(rows);
      downloadFile(csv, `todos-${project.name}.csv`, 'text/csv;charset=utf-8');
    },
    [projects],
  );

  // 导出历史记录（归档）为独立 JSON 快照。跨项目全量，按归档时间倒序。
  // 注意：这是只读备份，刻意不被 parseImportData 识别，不可导回。
  const handleExportHistory = useCallback(() => {
    const archivedTodos = db.getAllDeletedTodos();
    // 仅保留归档事项涉及的项目，避免把无关项目名也写进快照
    const usedIds = new Set(archivedTodos.map((t) => t.projectId));
    const projectNames: Record<string, string> = {};
    for (const p of projects) {
      if (usedIds.has(p.id)) projectNames[p.id] = p.name;
    }
    const json = exportHistoryAsJson({
      version: EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      kind: 'celery-todo-history',
      archivedTodos,
      projectNames,
    });
    downloadFile(json, `archive-${new Date().toISOString().split('T')[0]}.json`);
  }, [projects]);

  // === 导出项目为图片 ===
  // 打开预览弹窗；项目元信息 + 该项目全量 todos 在打开瞬间拍快照，
  // 弹窗里的筛选/截图都基于这份快照，与外部状态变化隔离。
  const [exportImageTarget, setExportImageTarget] = useState<{
    project: Project;
    todos: Todo[];
  } | null>(null);

  const handleExportImage = useCallback(
    (projectId: string) => {
      const project = projects.find((p) => p.id === projectId);
      if (!project) return;
      const projectTodos = db.getTodosByProject(projectId);
      setExportImageTarget({ project, todos: projectTodos });
    },
    [projects],
  );

  // 设置页「导出项目」对话框的统一分发：根据格式转给对应处理函数。
  // JSON / 图片复用侧栏右键菜单的同款实现，CSV 走按项目查库的版本。
  const handleExportProjectWithFormat = useCallback(
    (projectId: string, format: 'json' | 'csv' | 'image') => {
      if (format === 'json') handleExportProject(projectId);
      else if (format === 'image') handleExportImage(projectId);
      else handleExportCsvForProject(projectId);
    },
    [handleExportProject, handleExportImage, handleExportCsvForProject],
  );

  const handleImportProject = useCallback(
    async (file: File) => {
      try {
        const text = await readFileAsText(file);
        const data = parseImportData(text);
        if ('project' in data) {
          // 导入单个项目
          const newId = createProject(data.project.name);
          db.insertTodos(
            data.todos.map((t) => ({ ...t, id: crypto.randomUUID(), projectId: newId })),
          );
          useTodoStore.getState().loadProject(newId);
          switchProject(newId);
        } else {
          // 导入完整应用数据
          await db.importAllData(data);
          loadProjects();
          useSettingsStore.getState().loadSettings();
          // autoStart 同时存在于 SQLite 设置和操作系统登录项；全量导入恢复了前者，
          // 这里同步后者，避免设置面板与系统实际状态不一致。
          void window.electronAPI
            ?.setAutoStart?.(useSettingsStore.getState().autoStart)
            .catch(() => {});
          // 导入后优先恢复备份中的上次活跃项目；该项目不存在或旧备份没有该设置时，
          // 再回退到第一个项目。不能沿用导入前的 activeProjectId，否则偶发同 ID
          // 命中时会把旧会话状态带进新数据集。
          const store = useProjectStore.getState();
          const importedLastId = useSettingsStore.getState().lastActiveProjectId;
          const targetId = store.projects.some((p) => p.id === importedLastId)
            ? importedLastId
            : (store.projects[0]?.id ?? '');
          if (store.activeProjectId !== targetId) {
            store.setActiveProject(targetId);
          }
          useTodoStore.getState().loadProject(targetId);
        }
      } catch (err) {
        alert(`导入失败: ${err instanceof Error ? err.message : '未知错误'}`);
      }
    },
    [createProject, switchProject, loadProjects],
  );

  const handleResetData = useCallback(async () => {
    await db.resetDatabase();
    await db.initDatabase();
    useProjectStore.getState().loadProjects();
    // 重置后项目列表为空，activeProjectId 为空串；清空当前 todo 视图
    useTodoStore.getState().loadProject(useProjectStore.getState().activeProjectId);
    useSettingsStore.getState().loadSettings();
    setSettingsOpen(false);
  }, []);

  // 触发原生文件选择框导入（与 Header「数据 → 导入数据」同一条路径）。
  // Electron 的 <input type=file> 默认弹系统原生文件框，与主进程 dialog 行为等价。
  const handleImportClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) void handleImportProject(file);
    };
    input.click();
  }, [handleImportProject]);

  // Ctrl/Cmd + Shift 组合快捷键（项目/数据/窗口操作）。
  // 与上面首个 useKeyboardShortcuts 调用分离，因为依赖的 handler 在此处才定义完毕。
  // 多次调用 useKeyboardShortcuts 是安全的：每个调用各自注册独立的 keydown 监听器。
  useKeyboardShortcuts({
    onCreateProject: () => {
      setSidebarOpen(true);
      setCreateProjectSignal((signal) => signal + 1);
    },
    onImport: handleImportClick,
    onExportAll: handleExportAll,
    onExportCsv: handleExportCsv,
    onEnterCompactMode: () => {
      void window.electronAPI?.createSticker(activeProjectId);
    },
  });

  // === 加载状态 ===
  if (!dbReady) {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Logo variant="full" size={128} />
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            className="w-5 h-5 border-[1.5px] rounded-full"
            style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--accent)' }}
          />
        </motion.div>
      </div>
    );
  }

  return (
    // 顶部栏 + 下方两栏布局:
    //   ┌──────────────────────────────────────────┐
    //   │ [侧][菜单]       项目标题                  │ ← 顶部栏始终保持完整
    //   ├───────────┬──────────────────────────────┤
    //   │ Celery  搜索│                              │
    //   │ 项目列表   │                              │
    //   │ Logo/菜单  │   主内容 (TodoList)          │ ← 仅左侧栏可收起
    //   │ [更新卡片] │                              │
    //   └───────────┴──────────────────────────────┘
    // 顶部栏与侧栏使用 --bg-frame(暖陶土橙),主区使用 --bg-primary(暖纸色)。
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-frame)' }}>
      {/* 顶部行 - 全宽,专注模式下整行隐藏 */}
      {!focusMode && (
        <div className="flex flex-shrink-0">
          {/*
            顶部工具组始终占据与展开侧栏相同的宽度。它不参与 sidebarOpen 的宽度动画，
            因而点击「收起侧边栏」后恢复按钮和应用菜单仍留在顶部原位。
            搜索按钮由 Header 向下定位到侧边栏标题行，位置与参考图一致。
          */}
          <div className="relative h-full w-[280px] flex-shrink-0">
            <Header
              sidebarOpen={sidebarOpen}
              search={globalSearch}
              searchFocusSignal={searchFocusSignal}
              onToggleSidebar={() => setSidebarOpen((value) => !value)}
              onSearchChange={setGlobalSearch}
              searchResults={globalSearchResults}
              onSelectSearchResult={handleSelectGlobalSearchResult}
              onImport={handleImportProject}
              onExportAll={handleExportAll}
              onExportCsv={handleExportCsv}
              onCreateProject={() => {
                setSidebarOpen(true);
                setCreateProjectSignal((signal) => signal + 1);
              }}
              onEnterCompactMode={() => void window.electronAPI?.createSticker(activeProjectId)}
              onCloseWindow={() => window.close()}
            />
          </div>

          {/*
            顶部标题区:仅显示当前项目名(单行),与左侧 Header 工具组(py-2 + h-7 ≈ 44px)
            通过 flex stretch 对齐成同一高度的顶部栏。pr-[152px] 给原生 overlay 让位。
            背景 --bg-frame,与左侧工具组合成一条完整顶部栏。
          */}
          <div
            className="relative flex h-full flex-1 items-center gap-3 px-7 pr-[152px]"
            style={{ backgroundColor: 'var(--bg-frame)' }}
          >
            {/* 拖拽区:标题与徽标之间的空白处可拖动整窗。 */}
            <div
              aria-hidden="true"
              className="titlebar-drag pointer-events-auto absolute inset-y-0 right-[152px]"
              style={{ left: '0px' }}
            />
            <div className="titlebar-no-drag relative z-10 min-w-0">
              <h1
                className="truncate text-lg font-serif font-semibold leading-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                {activeProject?.name ?? 'Celery Todo'}
              </h1>
            </div>
            {/* 更新提醒已移至左下角侧边栏卡片（SidebarUpdateCard），右上象限不再显示徽标。
                标题与右侧原生窗口控制按钮之间的空白作为拖拽区使用。 */}
            <div className="titlebar-no-drag relative z-10 ml-auto flex items-center gap-0.5" />
          </div>
        </div>
      )}

      {/* 内容行:左侧项目栏 + 右侧主区。专注模式下只剩主区(全宽)。 */}
      <div
        className="sidebar-grid flex-1 min-h-0"
        data-sidebar={focusMode ? 'hidden' : sidebarOpen ? 'open' : 'closed'}
      >
        {/*
          左下项目栏 - 专注模式下完全隐藏(直接不渲染)
          动画策略:父级 .sidebar-grid 用 grid-template-columns 动画驱动布局占位
          (避免传统 width 动画的 layout reflow),内层用 GPU transform 辅助退场。
          - 容器始终挂载,避免挂载/卸载与 exit 动画的协调问题
          - 内层 .sidebar-inner 固定 280px,<aside> 始终保持完整背景
          - 顶部栏已是独立行,左下栏顶部不再需要为浮动工具让位
          收起时 overflow-hidden 把固定宽度的内层从右向左裁剪。
        */}
        {!focusMode && (
          <div
            className="sidebar-shell group/sidebar relative h-full overflow-hidden"
            data-open={sidebarOpen}
          >
            <div className="sidebar-inner h-full" style={{ width: '280px', minWidth: '280px' }}>
              <ProjectSidebar
                projects={projects}
                activeProjectId={activeProjectId}
                onSwitch={switchProject}
                onCreate={createProject}
                onRename={renameProject}
                onDelete={deleteProject}
                onExport={handleExportProject}
                onExportImage={handleExportImage}
                onReorder={reorderProjects}
                updateStatus={isAutoUpdateAvailable ? updateStatus : undefined}
                updateInfo={isAutoUpdateAvailable ? updateInfo : undefined}
                updateProgress={isAutoUpdateAvailable ? updateProgress : undefined}
                isNewlyAvailable={isAutoUpdateAvailable ? isNewlyAvailable : undefined}
                sidebarDismissed={isAutoUpdateAvailable ? sidebarDismissed : undefined}
                onDownloadUpdate={isAutoUpdateAvailable ? handleUpdateAction : undefined}
                onRestartToUpdate={isAutoUpdateAvailable ? handleUpdateAction : undefined}
                onDismissSidebarUpdate={isAutoUpdateAvailable ? dismissSidebarUpdate : undefined}
                onOpenSettings={openSettings}
                onOpenHistory={() => openSettings('history')}
                onOpenHelp={() =>
                  window.open('https://github.com/ouyangfeng2022/celery-todo#readme', '_blank')
                }
                onNewTodoInProject={handleNewTodoInProject}
                onCreateSticker={(projectId) => void window.electronAPI?.createSticker(projectId)}
                onImport={handleImportClick}
                onExportAll={handleExportAll}
                incompleteCounts={incompleteCounts}
                autofocusCreateSignal={createProjectSignal}
              />
            </div>
          </div>
        )}

        {/* 主内容区 - bg-primary(暖纸色,Anthropic 风格),与 L 形(--bg-frame 暖深色)分隔 */}
        <div
          className="workspace-surface relative flex-1 flex flex-col min-w-0"
          style={{ backgroundColor: 'var(--bg-primary)' }}
        >
          {/* 专注模式浮动指示器：点击退出，避免用户被困住 */}
          {/* 位置避开右上角原生窗口控制按钮（约 152px 宽） */}
          {focusMode && (
            <>
              {/* 隐藏的拖动条：专注模式下 Header 不渲染，需要保留拖动整窗能力 */}
              <div className="titlebar-drag absolute top-0 left-0 right-0 h-9 z-0 pointer-events-auto" />
              <button
                onClick={() => useSettingsStore.getState().setFocusMode(false)}
                className="titlebar-no-drag absolute top-2.5 right-[156px] z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] transition-colors hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--text-quaternary)' }}
                title="退出专注模式 (Ctrl+P)"
                aria-label="退出专注模式"
              >
                <FocusIcon size={13} />
                <span>专注中</span>
              </button>
              {/* 专注模式下不显示更新提醒：沉浸优先，用户退出专注后左下角卡片自然可见。
                isNewlyAvailable 在此期间仍由 useAutoUpdate 正常维护，信息不丢失。 */}
            </>
          )}

          <main ref={setMainScrollElement} className="flex-1 overflow-y-auto">
            {projects.length === 0 ? (
              // 无项目：引导创建第一个项目（优先于专注模式判断）
              <div className="mx-auto max-w-4xl px-5 py-8 lg:px-10 lg:py-12">
                <NoProjectsState
                  onCreate={() => {
                    // 专注模式下侧边栏被隐藏，先退出专注以露出新建输入框
                    if (focusMode) useSettingsStore.getState().setFocusMode(false);
                    setCreateProjectSignal((n) => n + 1);
                  }}
                />
              </div>
            ) : (
              <div className={cn('mx-auto', focusMode ? 'max-w-2xl' : 'max-w-4xl')}>
                {/*
                添加事项吸顶（sticky top-0）：列表过长向下滚动时输入框不再被推出视野。
                分两层处理遮挡：
                - 内层不透明（var(--bg-primary)）包住输入框本身，保证可读性；
                - 外层追加一段 linear-gradient → transparent 的渐变遮罩，遮挡范围
                  向下延伸超出输入框，但不完全覆盖，滚过来的列表项能柔和透出。
                拆两层而非单容器 padding 渐变的原因：AddTodoInput 高度动态（focus
                展开、textarea 多行），单容器渐变的「不透明/透明」分界点无法稳定
                对齐卡片底边；分两层后渐变永远紧贴卡片底部，与卡片高度无关。
                z-index 取 z-20 而非 z-10：FilterBar 的 segmented control 文字
                <span> 用了 relative z-10，而其父 button 未创建堆叠上下文，z-10
                「逃逸」到滚动区参与竞争。若吸顶也用 z-10，DOM 顺序 FilterBar 在后
                会反过来盖住吸顶（"全部/进行中/已完成"压在输入框上）。z-20 高过它，
                同时低于 TodoItem 优先级下拉菜单的 z-30，菜单弹出仍能浮在吸顶之上。
                完整模式始终可见；专注模式仅 Ctrl+N 唤出（composerVisible）时挂载。
              */}
                {(!focusMode || composerVisible) && (
                  <div className="sticky top-0 z-20">
                    <div
                      className="px-5 pt-7 pb-1 lg:px-10 lg:pt-12 lg:pb-2"
                      style={{ backgroundColor: 'var(--bg-primary)' }}
                    >
                      <AddTodoInput
                        projectId={activeProjectId}
                        onAdd={(title, priority, description) => {
                          addTodo(title, priority, description);
                          // 专注模式下添加完成后收起 composer
                          if (focusMode) setComposerVisible(false);
                        }}
                        focusSignal={newTodoFocusSignal}
                      />
                    </div>
                    {/*
                    渐变遮罩：遮挡范围向下延伸超出输入框，但不完全覆盖，滚过来的
                    列表项能柔和透出。起始点 80% 不透明（color-mix 混入 20% 透明），
                    让透明感更明显 —— 浅/深色主题都通过 var(--bg-primary) 自动适配。
                  */}
                    <div
                      className="h-10 lg:h-12"
                      style={{
                        backgroundImage:
                          'linear-gradient(to bottom, color-mix(in srgb, var(--bg-primary) 80%, transparent), transparent)',
                      }}
                    />
                  </div>
                )}

                {/* 统计 / 筛选 / 列表 —— 随主区滚动 */}
                <div className="space-y-6 px-5 pb-8 lg:px-10 lg:pb-12">
                  {/* 统计 - 专注模式下隐藏 */}
                  {!focusMode && (
                    <StatsPanel
                      total={stats.total}
                      completed={stats.completed}
                      active={stats.active}
                      percentage={stats.percentage}
                    />
                  )}

                  {/* 筛选栏 - 专注模式下隐藏 */}
                  {!focusMode && (
                    <FilterBar
                      filter={filter}
                      sort={sort}
                      activeCount={stats.active}
                      completedCount={stats.completed}
                      onFilterChange={changeFilter}
                      onSortChange={changeSort}
                      onClearCompleted={() => {
                        const ids = activeProjectTodos
                          .filter((todo) => todo.completed)
                          .map((todo) => todo.id);
                        clearCompleted();
                        showArchiveNotice(ids);
                      }}
                    />
                  )}

                  {/* 事项列表 / 全部完成庆祝卡片（互斥） */}
                  {allDone ? (
                    <AllDoneCelebration
                      completed={stats.completed}
                      onRestore={handleAllDoneRestore}
                    />
                  ) : (
                    <TodoList
                      // 项目切换不是同一列表内的删除和新增：重置 Presence 边界，
                      // 不让旧项目的 exit 节点与新项目的 enter 节点同时存在。
                      key={activeProjectId}
                      todos={filteredTodos}
                      scrollElement={mainScrollElement}
                      selectedIds={selectedIds}
                      sort={sort}
                      filter={filter}
                      hasTodos={stats.total > 0}
                      focusTarget={todoFocusTarget}
                      onToggle={toggleTodo}
                      onEdit={updateTodo}
                      onDelete={(id) => {
                        deleteTodo(id);
                        showArchiveNotice([id]);
                      }}
                      onToggleSelect={toggleSelected}
                      onReorder={reorderTodos}
                      onSortChange={changeSort}
                      onSnapshotOrder={snapshotOrder}
                    />
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* 批量操作工具栏 */}
      <BatchToolbar
        selectedCount={selectedIds.size}
        onClearSelection={clearSelection}
        onBatchComplete={() => batchAction('complete')}
        onBatchUncomplete={() => batchAction('uncomplete')}
        onBatchDelete={() => {
          const ids = Array.from(selectedIds);
          batchAction('delete');
          showArchiveNotice(ids);
        }}
        onBatchSetPriority={(p: Priority) => batchAction('setPriority', p)}
      />

      <ArchiveNotice
        variant="archived"
        count={archiveNoticeIds.length}
        horizontalOffset={!focusMode && sidebarOpen ? 140 : 0}
        onUndo={handleUndoArchive}
        onOpenHistory={() => {
          setArchiveNoticeIds([]);
          openSettings('history');
        }}
        onDismiss={() => setArchiveNoticeIds([])}
      />

      {restoreNotice && (
        <ArchiveNotice
          variant="restored"
          count={restoreNotice.count}
          projectName={restoreNotice.projectName}
          horizontalOffset={!focusMode && sidebarOpen ? 140 : 0}
          onOpenProject={() => {
            const target = restoreNotice;
            setRestoreNotice(null);
            setSettingsOpen(false);
            setRestoreTargetFilter({ projectId: target.projectId, filter: target.filter });
            switchProject(target.projectId);
          }}
          onDismiss={() => setRestoreNotice(null)}
        />
      )}

      {/* 设置面板 */}
      <SettingsPanel
        open={settingsOpen}
        initialSection={settingsSection}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onUpdateSettings={(updates) => useSettingsStore.getState().updateSettings(updates)}
        onExportAll={handleExportAll}
        activeProjectId={activeProjectId}
        onExportProject={handleExportProjectWithFormat}
        onExportCsv={handleExportCsv}
        onImportAll={handleImportProject}
        onResetData={handleResetData}
        // ===== 顶部 Header 工具组(与主页面 Header 接线一致) =====
        // 设置页是全屏浮层,遮盖主页面 TodoList/侧栏。Header 工具组里凡「结果落在
        // 主页面」的操作(搜索/导入/新建项目/简洁模式),都先关设置页再触发,
        // 让操作与反馈都在主页面语境发生,避免「点了看不见」。
        // 注意:导入/导出回调与 DataSection 共用(onImportAll/onExportAll/onExportCsv),
        // 「先关设置页」的包装在 SettingsPanel 内部统一处理,App 只提供单一来源。
        sidebarOpen={sidebarOpen}
        search={globalSearch}
        onToggleSidebar={() => setSidebarOpen((value) => !value)}
        onSearchChange={setGlobalSearch}
        // 新建项目 / 进入简洁模式:同上,先关设置页再触发。
        onCreateProject={() => {
          setSettingsOpen(false);
          setSidebarOpen(true);
          setCreateProjectSignal((signal) => signal + 1);
        }}
        onEnterCompactMode={() => {
          setSettingsOpen(false);
          void window.electronAPI?.createSticker(activeProjectId);
        }}
        onCloseWindow={() => window.close()}
        // ===== 历史记录（归档）页面所需 =====
        projects={projects}
        onRestoreTodo={handleRestoreFromHistory}
        onPermanentDeleteTodo={permanentlyDelete}
        onEmptyArchive={emptyArchive}
        onExportHistory={handleExportHistory}
        updateStatus={isAutoUpdateAvailable ? updateStatus : undefined}
        updateInfo={isAutoUpdateAvailable ? updateInfo : undefined}
        updateProgress={isAutoUpdateAvailable ? updateProgress : undefined}
        updateError={isAutoUpdateAvailable ? updateError : undefined}
        onCheckUpdates={isAutoUpdateAvailable ? checkForUpdates : undefined}
        onDownloadUpdate={isAutoUpdateAvailable ? downloadUpdate : undefined}
        onRestartToUpdate={isAutoUpdateAvailable ? () => void quitAndInstall() : undefined}
      />

      {/* 导出项目为图片预览弹窗 */}
      {exportImageTarget && (
        <ExportImageDialog
          open={exportImageTarget !== null}
          project={exportImageTarget.project}
          todos={exportImageTarget.todos}
          onClose={() => setExportImageTarget(null)}
        />
      )}
    </div>
  );
}

export default App;
