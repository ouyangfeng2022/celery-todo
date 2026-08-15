/**
 * @file App - 应用根组件
 * @description 组合所有组件，管理全局状态和布局。3.0 迁移自 2.x App.tsx 并拆分：
 *              启动流程 → app/useAppBootstrap，跨窗口同步 → app/useDataSync，
 *              全局搜索 → app/useGlobalSearch，导入导出 → app/useExportImport，
 *              自绘标题行 → app/WindowTitlebar，首启导入横幅 → app/MigrationOffer。
 */

import { useEffect, useState, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';

import { useTodoStore } from './store/useTodoStore';
import { useSettingsStore } from './store/useSettingsStore';
import {
  selectTimeBucketCounts,
  TIME_BUCKET_LABELS,
  useTimeViewStore,
} from './store/useTimeViewStore';

import { useTodos } from './hooks/useTodos';
import { useProjects } from './hooks/useProjects';
import { useFilter } from './hooks/useFilter';
import { useTheme } from './hooks/useTheme';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

import { Header } from './components/layout/Header';
import { ProjectSidebar } from './components/projects/ProjectSidebar';
import { AddTodoInput } from './components/todos/AddTodoInput';
import { TimeView } from './components/todos/TimeView';
import { TemplateDialog } from './components/templates/TemplateDialog';
import { FilterBar } from './components/filters/FilterBar';
import { StatsPanel } from './components/stats/StatsPanel';
import { TodoList } from './components/todos/TodoList';
import { TodoBoard } from './components/todos/TodoBoard';
import { BatchToolbar } from './components/todos/BatchToolbar';
import { TodoDetailDialog } from './components/todos/TodoDetailDialog';
import type { SettingsSectionId } from './components/settings/SettingsPanel';
import { NoProjectsState } from './components/common/NoProjectsState';
import { AllDoneCelebration } from './components/common/AllDoneCelebration';
import { ArchiveNotice } from './components/common/ArchiveNotice';
import { ExportNotice } from './components/common/ExportNotice';
import { FocusIcon } from './components/common/Icons';
import { Logo } from './components/common/Logo';

import { useAutoUpdate } from './hooks/useAutoUpdate';
import { useAppBootstrap } from './app/useAppBootstrap';
import { useDataSync } from './app/useDataSync';
import { useGlobalSearch } from './app/useGlobalSearch';
import { useExportImport } from './app/useExportImport';
import { MigrationOffer } from './app/MigrationOffer';
import { WindowTitlebar } from './app/WindowTitlebar';
import { closeWindow, createSticker, onExportCompleted, onQuickAdd } from './platform';

import * as data from './utils/dataGateway';
import { cn } from './utils/helpers';
import type { TimeBucket } from './utils/planning';
import type { DeletedTodo, FilterType, NavigationMode, Priority, Project, Todo } from './types';

// 设置与导出不属于首屏工作流；只在用户打开相应入口时请求代码。
const SettingsPanel = lazy(() =>
  import('./components/settings/SettingsPanel').then((module) => ({
    default: module.SettingsPanel,
  })),
);
const ExportImageDialog = lazy(() =>
  import('./components/export/ExportImageDialog').then((module) => ({
    default: module.ExportImageDialog,
  })),
);
const ExportDataPreviewDialog = lazy(() =>
  import('./components/export/ExportDataPreviewDialog').then((module) => ({
    default: module.ExportDataPreviewDialog,
  })),
);
const ExportDialog = lazy(() =>
  import('./components/export/ExportDialog').then((module) => ({ default: module.ExportDialog })),
);

/**
 * 全部完成庆祝撒花：从屏幕两侧各发射一束粒子，克制、短促。
 * canvas-confetti 会自建并自行清理 canvas，无需手动管理。
 */
function fireCelebration() {
  const defaults = { spread: 70, startVelocity: 35, scalar: 0.9, ticks: 120, zIndex: 100 };
  confetti({ ...defaults, particleCount: 60, origin: { x: 0.2, y: 0.7 }, angle: 60 });
  confetti({ ...defaults, particleCount: 60, origin: { x: 0.8, y: 0.7 }, angle: 120 });
}

function App() {
  const [mainScrollElement, setMainScrollElement] = useState<HTMLElement | null>(null);
  // === 初始化（含首启 2.x 导入横幅） ===
  const { dbReady, offer, importing, offerError, runImport, skipImport } = useAppBootstrap();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>('general');
  const [newTodoFocusSignal, setNewTodoFocusSignal] = useState(0);
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
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
  const [exportNotice, setExportNotice] = useState<{ fileName: string; filePath: string } | null>(
    null,
  );
  const [incompleteCounts, setIncompleteCounts] = useState<Record<string, number>>({});
  const [navigationMode, setNavigationMode] = useState<NavigationMode>('project');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateSaveTarget, setTemplateSaveTarget] = useState<{
    project: Project;
    todos: Todo[];
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
    permanentlyDeleteProject,
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
  // 详情浮窗的开关直接订阅 store：useTodos 不暴露 openDetail，且浮窗本身会自取
  // detailTodoId，App 这里只需要把 openDetail 透传给列表/卡片视图。
  const openDetail = useTodoStore((state) => state.openDetail);
  // todos 与 currentProjectId 在 loadProject 里同一次 set 更新；用它在渲染期判断
  // 项目切换是否已对齐 —— activeProjectId（project store）总是先于 loadProject 更新，
  // 切换中途 todos 还属于上一项目。
  const currentProjectId = useTodoStore((state) => state.currentProjectId);
  const timeBucket = useTimeViewStore((state) => state.bucket);
  const timeTodos = useTimeViewStore((state) => state.allTodos);
  const setTimeBucket = useTimeViewStore((state) => state.setBucket);
  const timeCounts = useMemo(() => selectTimeBucketCounts(timeTodos), [timeTodos]);

  // activeProjectId 先于 useEffect 中的 loadProject 更新。渲染端再做一次
  // projectId 约束，确保这一个提交里绝不会把上一项目的事项交给列表动画树。
  const activeProjectTodos = useMemo(
    () => todos.filter((todo) => todo.projectId === activeProjectId),
    [todos, activeProjectId],
  );

  // === 跨窗口数据同步（贴图窗口 / CLI 写入后刷新本窗口） ===
  useDataSync(dbReady);

  // === 自动升级（tauri-plugin-updater，非 Tauri 环境入口隐藏） ===
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

  // 统计入口：作为设置页的一个子页面（不再有独立浮层，避免双浮层的点击陷阱）
  const openStats = useCallback(() => {
    setSettingsSection('stats');
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

  // === 筛选 ===
  // overrideFilter 仅在全局搜索定位的瞬间视作 'all'，确保被用户当前筛选
  // （'active'/'completed'）隐藏的目标事项仍能渲染出来再高亮定位。
  const searchFocusOverride = todoFocusTarget ? ('all' as const) : null;
  const { filter, sort, filteredTodos, stats, changeFilter, changeSort } = useFilter(
    activeProjectTodos,
    activeProjectId,
    searchFocusOverride,
  );
  // 切换项目时 activeProjectId 先于 loadProject 更新，中间一帧 activeProjectTodos
  // 被 projectId 约束为空、stats.total 跌到 0，会让 StatsPanel 卸载并在重挂载时把
  // 进度条从 0 重新涨上来（motion initial width:0）。在 todos 已对齐当前项目时缓存
  // stats，切换中沿用上一次有效值，让 StatsPanel 常驻、进度条不再重播。
  const stableStatsRef = useRef(stats);
  if (!activeProjectId || currentProjectId === activeProjectId) {
    stableStatsRef.current = stats;
  }
  const visibleStats =
    !activeProjectId || currentProjectId === activeProjectId ? stats : stableStatsRef.current;
  // 项目切换会让 useFilter 绑定新的 projectId；等两者对齐后再写入筛选，
  // 确保恢复已完成事项时进入「已完成」，未完成事项时进入「进行中」。
  useEffect(() => {
    if (!restoreTargetFilter || restoreTargetFilter.projectId !== activeProjectId) return;
    changeFilter(restoreTargetFilter.filter);
    setRestoreTargetFilter(null);
  }, [activeProjectId, changeFilter, restoreTargetFilter]);

  // === 全局事项搜索 ===
  const {
    keyword: globalSearch,
    setKeyword: setGlobalSearch,
    results: globalSearchResults,
  } = useGlobalSearch({ dbReady, projects, revision: todos.length + deletedTodos.length });

  const handleSelectGlobalSearchResult = useCallback(
    (result: { todo: Todo; project: Project }) => {
      setGlobalSearch('');
      switchProject(result.project.id);
      setTodoFocusTarget((current) => ({ id: result.todo.id, signal: (current?.signal ?? 0) + 1 }));
    },
    [setGlobalSearch, switchProject],
  );

  // 定位高亮 1700ms 后清空 todoFocusTarget，连带解除 searchFocusOverride：
  // 否则 overrideFilter 会永久视作 'all'，FilterBar 不再反映用户原筛选。
  useEffect(() => {
    if (!todoFocusTarget) return;
    const timer = window.setTimeout(() => setTodoFocusTarget(null), 1700);
    return () => window.clearTimeout(timer);
  }, [todoFocusTarget]);

  // === 各项目未完成 todo 计数 ===
  // 侧边栏需要展示所有项目的未完成数，而 useTodoStore 只持有当前项目的 todos。
  // 聚合交给 SQLite（incomplete_counts 单条 GROUP BY）；todos/deletedTodos 仍作为
  // 数据库内容变动信号，驱动聚合结果刷新。
  useEffect(() => {
    if (!dbReady) return;
    void data.getIncompleteCounts().then((stored) => {
      const counts: Record<string, number> = {};
      for (const project of projects) counts[project.id] = stored[project.id] ?? 0;
      setIncompleteCounts(counts);
    });
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
    void data.getSetting(celebratedKey).then((value) => {
      const alreadyCelebrated = !!celebratedKey && value === 'true';
      if (allDone && !prevAllDoneRef.current && !alreadyCelebrated) {
        fireCelebration();
        if (celebratedKey) void data.setSetting(celebratedKey, 'true');
      }
      prevAllDoneRef.current = allDone;
    });
  }, [allDone, activeProjectId]);

  // 点击「全部搞定」对号：归档本项目所有已完成项（进历史记录），并重置该项目庆祝键，
  // 让下次重新完成全部待办时再次撒花。归档后 todos 清空 → allDone 回落 false →
  // 渲染切回 TodoList，因 filteredTodos 为空而自然显示「从一件小事开始」空状态。
  const handleAllDoneRestore = useCallback(() => {
    if (activeProjectId) {
      void data.setSetting(`celebrated.${activeProjectId}`, 'false');
    }
    clearCompleted();
    showArchiveNotice(activeProjectTodos.filter((todo) => todo.completed).map((todo) => todo.id));
  }, [activeProjectId, activeProjectTodos, clearCompleted, showArchiveNotice]);

  useEffect(() => {
    if (!dbReady) return;
    if (navigationMode === 'time') {
      void useTimeViewStore.getState().load();
    } else if (activeProjectId) {
      // 时间视图可修改当前项目；切回项目模式时强制从数据库刷新，避免同一项目 id
      // 未变化而跳过 activeProjectId effect，导致刚添加/移动的事项暂时不可见。
      void useTodoStore.getState().loadProject(activeProjectId);
    }
  }, [activeProjectId, dbReady, navigationMode]);

  // === 项目切换时：持久化 + 重新加载 ===
  // 持久化拆出真值判断之外：删完最后一个项目时 activeProjectId 归空串也要写盘，
  // 否则下次启动会恢复一个已不存在的 id（虽有存在性校验兜底，但语义不清）。
  useEffect(() => {
    if (!dbReady) return;
    void data.setSetting('lastActiveProjectId', activeProjectId);
    if (activeProjectId) {
      void useTodoStore.getState().loadProject(activeProjectId);
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
    async (projectId: string) => {
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
      void data.flush();
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

  // === 托盘「快速添加事项」（tray.rs 菜单 → quick-add 事件） ===
  useEffect(() => {
    const off = onQuickAdd(() => {
      focusNewTodo();
    });
    return () => {
      off?.();
    };
  }, [focusNewTodo]);

  // 原生保存对话框写盘完成事件（回传真实路径，供 ExportNotice 展示）。
  useEffect(() => {
    const off = onExportCompleted(setExportNotice);
    return () => off?.();
  }, []);

  // === 导入导出 ===
  const {
    exportImageTarget,
    exportDialogTarget,
    exportDataPreviewTarget,
    openExportDialog,
    handleExportAll,
    handleExportAllExcel,
    handleExportHistory,
    handleExportProjectWithFormat,
    handleExportRequest,
    handleDirectExportRequest,
    handleImportProject,
    handleResetData,
    setExportDialogTarget,
    setExportImageTarget,
    setExportDataPreviewTarget,
  } = useExportImport({
    projects,
    createProject,
    switchProject,
    loadProjects,
  });

  const openTemplateLibrary = useCallback(() => {
    setTemplateSaveTarget(null);
    setTemplatesOpen(true);
  }, []);
  const handleSaveAsTemplate = useCallback(async (project: Project) => {
    if (project.kind === 'inbox') return;
    setTemplateSaveTarget({ project, todos: await data.getTodos(project.id) });
    setTemplatesOpen(true);
  }, []);

  // 触发原生文件选择框导入（与 Header「数据 → 导入数据」同一条路径）。
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
    onExportAll: () => openExportDialog(),
    onExportCsv: () => openExportDialog(activeProjectId),
    onEnterCompactMode: () => createSticker(activeProjectId),
    onOpenStats: openStats,
  });

  // === 加载状态 / 首启导入横幅 ===
  if (!dbReady) {
    if (offer.status === 'offer') {
      return (
        <MigrationOffer
          report={offer.report}
          importing={importing}
          error={offerError}
          onImport={() => void runImport()}
          onSkip={() => void skipImport()}
        />
      );
    }
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
    //   │ [侧][菜单]       项目标题        [_][□][×] │ ← 顶部栏始终保持完整
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
              onOpenExport={() => openExportDialog()}
              onCreateProject={() => {
                setSidebarOpen(true);
                setCreateProjectSignal((signal) => signal + 1);
              }}
              onEnterCompactMode={() => createSticker(activeProjectId)}
              onCloseWindow={closeWindow}
            />
          </div>

          {/* 顶部标题区 + 自绘窗口控制按钮（Tauri decorations: false） */}
          <WindowTitlebar
            title={
              navigationMode === 'time'
                ? TIME_BUCKET_LABELS[timeBucket]
                : (activeProject?.name ?? 'Celery Todo')
            }
          />
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
                onPermanentDelete={permanentlyDeleteProject}
                onOpenExport={openExportDialog}
                onReorder={reorderProjects}
                showWeeklyProjects={settings.showWeeklyProjects}
                onToggleWeeklyProjects={() =>
                  void settings.updateSettings({
                    showWeeklyProjects: !settings.showWeeklyProjects,
                  })
                }
                updateStatus={isAutoUpdateAvailable ? updateStatus : undefined}
                updateInfo={isAutoUpdateAvailable ? updateInfo : undefined}
                updateProgress={isAutoUpdateAvailable ? updateProgress : undefined}
                isNewlyAvailable={isAutoUpdateAvailable ? isNewlyAvailable : undefined}
                sidebarDismissed={isAutoUpdateAvailable ? sidebarDismissed : undefined}
                onDownloadUpdate={isAutoUpdateAvailable ? handleUpdateAction : undefined}
                onRestartToUpdate={isAutoUpdateAvailable ? handleUpdateAction : undefined}
                onDismissSidebarUpdate={isAutoUpdateAvailable ? dismissSidebarUpdate : undefined}
                onOpenSettings={openSettings}
                onOpenStats={openStats}
                onOpenHistory={() => openSettings('history')}
                onOpenHelp={() =>
                  window.open('https://github.com/ouyangfeng2022/celery-todo#readme', '_blank')
                }
                onNewTodoInProject={handleNewTodoInProject}
                onCreateSticker={(projectId) => createSticker(projectId)}
                onImport={handleImportClick}
                incompleteCounts={incompleteCounts}
                autofocusCreateSignal={createProjectSignal}
                navigationMode={navigationMode}
                onNavigationModeChange={(mode) => {
                  setNavigationMode(mode);
                  clearSelection();
                }}
                timeBucket={timeBucket}
                onTimeBucketChange={(bucket: TimeBucket) => setTimeBucket(bucket)}
                timeCounts={timeCounts}
                onOpenTemplates={openTemplateLibrary}
                onSaveAsTemplate={(project) => void handleSaveAsTemplate(project)}
              />
            </div>
          </div>
        )}

        {/* 主内容区 - bg-primary(暖纸色),与 L 形(--bg-frame 暖深色)分隔 */}
        <div
          className="workspace-surface relative flex-1 flex flex-col min-w-0"
          style={{ backgroundColor: 'var(--bg-primary)' }}
        >
          {/* 专注模式浮动指示器：点击退出，避免用户被困住 */}
          {focusMode && (
            <>
              {/* 隐藏的拖动条：专注模式下 Header 不渲染，需要保留拖动整窗能力 */}
              <div
                data-tauri-drag-region
                className="titlebar-drag absolute top-0 left-0 right-0 h-9 z-0 pointer-events-auto"
              />
              <button
                onClick={() => useSettingsStore.getState().setFocusMode(false)}
                className="titlebar-no-drag absolute top-2.5 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] transition-colors hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--text-quaternary)' }}
                title="退出专注模式 (Ctrl+P)"
                aria-label="退出专注模式"
              >
                <FocusIcon size={13} />
                <span>专注中</span>
              </button>
            </>
          )}

          <main ref={setMainScrollElement} className="flex-1 overflow-y-auto">
            {navigationMode === 'time' ? (
              <TimeView
                projects={projects}
                onInboxCreated={(inbox) => {
                  void loadProjects().then(() => switchProject(inbox.id));
                }}
                onOpenProject={(projectId, todoId) => {
                  setNavigationMode('project');
                  switchProject(projectId);
                  if (todoId) {
                    setTodoFocusTarget((current) => ({
                      id: todoId,
                      signal: (current?.signal ?? 0) + 1,
                    }));
                  }
                }}
              />
            ) : projects.length === 0 ? (
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
              <div
                className={cn(
                  'mx-auto',
                  focusMode
                    ? 'max-w-2xl'
                    : settings.todoViewMode === 'card'
                      ? 'max-w-6xl'
                      : 'max-w-4xl',
                )}
              >
                {/*
                  添加事项吸顶（sticky top-0）：列表过长向下滚动时输入框不再被推出视野。
                  z-index 取 z-20：高于 FilterBar 的文字 <span>（relative z-10），
                  低于 TodoItem 优先级下拉菜单的 z-30。
                */}
                {(!focusMode || composerVisible) && (
                  <div className="sticky top-0 z-20">
                    <div
                      className="px-5 pt-7 pb-1 lg:px-10 lg:pt-12 lg:pb-2"
                      style={{ backgroundColor: 'var(--bg-primary)' }}
                    >
                      <AddTodoInput
                        projectId={activeProjectId}
                        onAdd={(title, priority, description, plannedDate) => {
                          addTodo(title, priority, description, plannedDate);
                          // 专注模式下添加完成后收起 composer
                          if (focusMode) setComposerVisible(false);
                        }}
                        focusSignal={newTodoFocusSignal}
                      />
                    </div>
                  </div>
                )}

                {/* 统计 / 筛选 / 列表 —— 随主区滚动 */}
                <div className="space-y-6 px-5 pb-8 lg:px-10 lg:pb-12">
                  {/* 统计 - 专注模式下隐藏 */}
                  {!focusMode && (
                    <StatsPanel
                      total={visibleStats.total}
                      completed={visibleStats.completed}
                      active={visibleStats.active}
                      percentage={visibleStats.percentage}
                    />
                  )}

                  {/* 筛选栏 - 专注模式下隐藏 */}
                  {!focusMode && (
                    <FilterBar
                      filter={filter}
                      sort={sort}
                      activeCount={stats.active}
                      completedCount={stats.completed}
                      viewMode={settings.todoViewMode}
                      onFilterChange={changeFilter}
                      onSortChange={changeSort}
                      onViewModeChange={(todoViewMode) => {
                        clearSelection();
                        void settings.updateSettings({ todoViewMode });
                      }}
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
                  ) : settings.todoViewMode === 'card' ? (
                    <TodoBoard
                      key={activeProjectId}
                      todos={filteredTodos}
                      selectedIds={selectedIds}
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
                      onOpenDetail={openDetail}
                    />
                  ) : (
                    <TodoList
                      // 项目切换时重置列表状态；筛选切换由 TodoList 自身拆分为
                      // 「即时按钮反馈 → 下一帧挂载新行」，因此不能随 filter 重挂载外壳。
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
                      onOpenDetail={openDetail}
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

      {/* 事项详情浮窗：点击 todo 标题/编辑按钮触发，承担完整编辑能力 */}
      <TodoDetailDialog />

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

      {exportNotice && (
        <ExportNotice
          fileName={exportNotice.fileName}
          filePath={exportNotice.filePath}
          horizontalOffset={!focusMode && sidebarOpen ? 140 : 0}
          onDismiss={() => setExportNotice(null)}
        />
      )}

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
      <Suspense fallback={null}>
        <TemplateDialog
          open={templatesOpen}
          saveTarget={templateSaveTarget}
          onClose={() => {
            setTemplatesOpen(false);
            setTemplateSaveTarget(null);
          }}
          onCreated={(project) => {
            void loadProjects().then(() => {
              setNavigationMode('project');
              switchProject(project.id);
            });
          }}
        />

        <SettingsPanel
          open={settingsOpen}
          initialSection={settingsSection}
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onUpdateSettings={(updates) => useSettingsStore.getState().updateSettings(updates)}
          onOpenExport={() => openExportDialog()}
          onImportAll={handleImportProject}
          onResetData={() => {
            void handleResetData().then(() => setSettingsOpen(false));
          }}
          // ===== 顶部 Header 工具组(与主页面 Header 接线一致) =====
          sidebarOpen={sidebarOpen}
          search={globalSearch}
          onToggleSidebar={() => setSidebarOpen((value) => !value)}
          onSearchChange={setGlobalSearch}
          // 新建项目 / 进入简洁模式:先关设置页再触发。
          onCreateProject={() => {
            setSettingsOpen(false);
            setSidebarOpen(true);
            setCreateProjectSignal((signal) => signal + 1);
          }}
          onEnterCompactMode={() => {
            setSettingsOpen(false);
            createSticker(activeProjectId);
          }}
          onCloseWindow={closeWindow}
          // ===== 历史记录（归档）页面所需 =====
          projects={projects}
          onRestoreTodo={handleRestoreFromHistory}
          onPermanentDeleteTodo={permanentlyDelete}
          onEmptyArchive={emptyArchive}
          onExportHistory={() => void handleExportHistory()}
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
            autoExport={exportImageTarget.autoExport}
            onClose={() => setExportImageTarget(null)}
          />
        )}

        <ExportDialog
          open={exportDialogTarget !== null}
          projects={projects}
          defaultScope={exportDialogTarget?.scope}
          defaultProjectId={exportDialogTarget?.projectId ?? activeProjectId}
          onClose={() => setExportDialogTarget(null)}
          onPreview={handleExportRequest}
          onExport={handleDirectExportRequest}
        />

        {exportDataPreviewTarget && (
          <ExportDataPreviewDialog
            open={exportDataPreviewTarget !== null}
            scope={exportDataPreviewTarget.request.scope}
            format={exportDataPreviewTarget.request.format as 'json' | 'excel'}
            projects={exportDataPreviewTarget.projects}
            projectTodos={exportDataPreviewTarget.projectTodos}
            jsonPreview={exportDataPreviewTarget.jsonPreview}
            onClose={() => setExportDataPreviewTarget(null)}
            onDownload={() => {
              const { scope, projectId, format } = exportDataPreviewTarget.request;
              if (scope === 'all') {
                if (format === 'excel') void handleExportAllExcel();
                else void handleExportAll();
              } else {
                handleExportProjectWithFormat(projectId, format);
              }
            }}
          />
        )}
      </Suspense>
    </div>
  );
}

export default App;
