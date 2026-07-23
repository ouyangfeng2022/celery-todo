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
import { AppToolbar } from './components/layout/AppToolbar';
import { ProjectSidebar } from './components/projects/ProjectSidebar';
import { AddTodoInput } from './components/todos/AddTodoInput';
import { FilterBar } from './components/filters/FilterBar';
import { StatsPanel } from './components/stats/StatsPanel';
import { TodoList } from './components/todos/TodoList';
import { BatchToolbar } from './components/todos/BatchToolbar';
import { SettingsPanel, type SettingsSectionId } from './components/settings/SettingsPanel';
import { HistoryPanel } from './components/settings/HistoryPanel';
import { NoProjectsState } from './components/common/NoProjectsState';
import { AllDoneCelebration } from './components/common/AllDoneCelebration';
import { FocusIcon } from './components/common/Icons';
import { Logo } from './components/common/Logo';
import { UpdateBadge } from './components/common/UpdateBadge';

import { useAutoUpdate } from './hooks/useAutoUpdate';
import { useCliBridge } from './cli-bridge';

import * as db from './utils/database';
import { exportAppAsJson, exportProjectAsJson, parseImportData, todosToCsv } from './utils/export';
import { cn, downloadFile, readFileAsText } from './utils/helpers';
import type { Priority } from './types';

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
  // === 初始化数据库 ===
  const [dbReady, setDbReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>('general');
  // 历史记录独立弹窗（侧栏「历史记录」入口唤出，与「设置」弹窗分离）
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newTodoFocusSignal, setNewTodoFocusSignal] = useState(0);
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
  // 专注模式下 AddTodoInput 默认隐藏，Ctrl+N 临时唤出；添加完成或 Esc 后回隐藏
  const [composerVisible, setComposerVisible] = useState(false);
  // 主区「请创建项目」按钮触发侧边栏新建输入框聚焦：递增值驱动 ProjectSidebar 的 effect
  const [createProjectSignal, setCreateProjectSignal] = useState(0);

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
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
    acknowledgeUpdate,
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

  // === CLI IPC 桥接（顶层挂载一次，监听主进程转发的 CLI 请求）===
  useCliBridge();

  // === 筛选 ===
  const { filter, sort, search, filteredTodos, stats, changeFilter, changeSort, changeSearch } =
    useFilter(activeProjectTodos, activeProjectId);

  // === 各项目未完成 todo 计数 ===
  // 侧边栏需要展示所有项目的未完成数，而 useTodoStore 只持有当前项目的 todos，
  // 故直接从 DB 全量取并按 projectId 聚合。todos/deletedTodos 作为 store 变更信号：
  // 它们的引用在任意增删改/切换/导入/重置后都会更新，从而驱动重算（body 内并不直接读取）。
  // dbReady 守卫：useMemo 在首渲染即执行，此时 DB 尚未异步初始化完成，直接查询会抛错。
  const incompleteCounts = useMemo<Record<string, number>>(() => {
    if (!dbReady) return {};
    const counts: Record<string, number> = {};
    for (const p of projects) counts[p.id] = 0;
    for (const t of db.getAllTodos()) {
      if (!t.completed) counts[t.projectId] = (counts[t.projectId] ?? 0) + 1;
    }
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
  }, [activeProjectId, clearCompleted]);

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
  // database.persistDatabase 触发 notifyDataChanged，主进程转发给除发起者外的
  // 其它窗口；这里订阅后重读内存库并刷新当前视图，即可看到对方的修改。
  useEffect(() => {
    window.electronAPI?.onDataChanged?.(async () => {
      await db.reloadDatabase();
      useSettingsStore.getState().loadSettings();
      useProjectStore.getState().loadProjects();
      // 用当前 activeProjectId（不是 settings.lastActiveProjectId，
      // 后者是上次启动的快照，这里要的是用户当前正在看的项目）
      useTodoStore.getState().loadProject(useProjectStore.getState().activeProjectId);
    });
  }, []);

  // === 安装阶段勾选了"开机自启"时的同步 ===
  // 主进程已在 NSIS 安装时通过 app.setLoginItemSettings 写好注册表，
  // 通过 IPC 推送这个事实，这里把 settings.autoStart 同步进 DB + store，
  // 让设置面板的复选框与系统真实状态保持一致。事件是一次性的（主进程仅发一次）。
  useEffect(() => {
    if (!window.electronAPI?.onInstallOptionsAutoStart) return;
    window.electronAPI.onInstallOptionsAutoStart((enabled) => {
      useSettingsStore.getState().setAutoStart(enabled);
    });
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

  // === 键盘快捷键 ===
  useKeyboardShortcuts({
    onNewTodo: () => {
      // 专注模式下 AddTodoInput 默认隐藏，Ctrl+N 先把它唤出再触发聚焦
      if (focusMode) setComposerVisible(true);
      setNewTodoFocusSignal((n) => n + 1);
    },
    onSearch: () => setSearchFocusSignal((n) => n + 1),
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
      setHistoryOpen(false);
      // 专注模式下 Esc 收起临时唤出的 AddTodoInput
      if (focusMode) setComposerVisible(false);
    },
  });

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

  const handleImportProject = useCallback(
    async (file: File) => {
      try {
        const text = await readFileAsText(file);
        const data = parseImportData(text);
        if ('project' in data) {
          // 导入单个项目
          const newId = createProject(data.project.name);
          data.todos.forEach((t) => {
            db.insertTodo({ ...t, id: crypto.randomUUID(), projectId: newId });
          });
          useTodoStore.getState().loadProject(newId);
          switchProject(newId);
        } else {
          // 导入完整应用数据
          await db.importAllData(data);
          loadProjects();
          useSettingsStore.getState().loadSettings();
          // 导入后确保 active 指向一个真实存在的项目：原 active 可能指向已不存在的项目
          // （或首启时为空串），此时回退到导入后的第一个项目
          const store = useProjectStore.getState();
          const exists = store.projects.some((p) => p.id === store.activeProjectId);
          const targetId = exists ? store.activeProjectId : (store.projects[0]?.id ?? '');
          if (!exists && targetId) {
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
          <div className="flex items-center gap-2.5">
            <Logo size={32} />
            <h1
              className="text-xl font-serif font-semibold leading-none whitespace-nowrap flex items-center gap-[0.35em]"
              style={{ color: 'var(--text-primary)' }}
            >
              <span className="italic">Celery</span>
              <span
                aria-hidden="true"
                className="w-[5px] h-[5px] rounded-full flex-shrink-0"
                style={{ backgroundColor: 'var(--accent)' }}
              />
              <span>Todo</span>
            </h1>
          </div>
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
    <div className="h-full flex" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {!focusMode && (
        <AppToolbar
          sidebarOpen={sidebarOpen}
          search={search}
          searchFocusSignal={searchFocusSignal}
          onToggleSidebar={() => setSidebarOpen((value) => !value)}
          onSearchChange={changeSearch}
          onOpenHistory={() => setHistoryOpen(true)}
          onImport={handleImportProject}
          onExportAll={handleExportAll}
          onExportCsv={handleExportCsv}
          onCreateProject={() => {
            setSidebarOpen(true);
            setCreateProjectSignal((signal) => signal + 1);
          }}
          onEnterCompactMode={() => void window.electronAPI?.createSticker(activeProjectId)}
          onCloseWindow={() => window.close()}
          onOpenHelp={() =>
            window.open('https://github.com/ouyangfeng2022/celery-todo#readme', '_blank')
          }
        />
      )}
      {/*
        侧边栏 - 专注模式下完全隐藏（直接不渲染）
        动画策略：外层只控制 width 0 ↔ 256px，内层用 GPU transform 辅助退场。
        - 容器始终挂载，避免挂载/卸载与 exit 动画的协调问题
        - 内层 .sidebar-inner 固定 256px，<aside> 始终保持完整背景
        - 侧栏与 Header 共用同一套 260ms 缓动，避免标题偏移先跳变造成重叠
        收起时 overflow-hidden 把固定宽度的内层从右向左裁剪。
      */}
      {!focusMode && (
        <div
          className="sidebar-shell group/sidebar relative h-full flex-shrink-0 overflow-hidden"
          data-open={sidebarOpen}
          style={{ width: sidebarOpen ? '256px' : '0px' }}
        >
          <div className="sidebar-inner h-full" style={{ width: '256px', minWidth: '256px' }}>
            <ProjectSidebar
              projects={projects}
              activeProjectId={activeProjectId}
              onSwitch={switchProject}
              onCreate={createProject}
              onRename={renameProject}
              onDelete={deleteProject}
              onExport={handleExportProject}
              onReorder={reorderProjects}
              updateStatus={isAutoUpdateAvailable ? updateStatus : undefined}
              updateInfo={isAutoUpdateAvailable ? updateInfo : undefined}
              updateProgress={isAutoUpdateAvailable ? updateProgress : undefined}
              onDownloadUpdate={isAutoUpdateAvailable ? handleUpdateAction : undefined}
              onRestartToUpdate={isAutoUpdateAvailable ? handleUpdateAction : undefined}
              onOpenSettings={openSettings}
              incompleteCounts={incompleteCounts}
              autofocusCreateSignal={createProjectSignal}
            />
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <div className="relative flex-1 flex flex-col min-w-0">
        {/* Header - 专注模式下隐藏，由右上角浮动指示器代替 */}
        {!focusMode && (
          <Header
            project={activeProject}
            toolbarInset={!sidebarOpen}
            hasUpdate={isAutoUpdateAvailable && updateStatus === 'available'}
            updateVersion={updateInfo?.version}
            isNewlyAvailable={isNewlyAvailable}
            onOpenUpdateDialog={handleUpdateAction}
          />
        )}

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
            {/* 专注模式下也保留更新徽标：更新提醒不应被沉浸模式隐藏。
                位置贴在专注按钮左侧，避开右上角原生窗口控制按钮。 */}
            {isAutoUpdateAvailable && updateStatus === 'available' && (
              <div className="titlebar-no-drag absolute top-1.5 right-[230px] z-10">
                <UpdateBadge
                  version={updateInfo?.version}
                  isNewlyAvailable={isNewlyAvailable}
                  onClick={handleUpdateAction}
                />
              </div>
            )}
          </>
        )}

        <main className="flex-1 overflow-y-auto">
          {projects.length === 0 ? (
            // 无项目：引导创建第一个项目（优先于专注模式判断）
            <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8 lg:py-10">
              <NoProjectsState
                onCreate={() => {
                  // 专注模式下侧边栏被隐藏，先退出专注以露出新建输入框
                  if (focusMode) useSettingsStore.getState().setFocusMode(false);
                  setCreateProjectSignal((n) => n + 1);
                }}
              />
            </div>
          ) : (
            <div className={cn('mx-auto', focusMode ? 'max-w-2xl' : 'max-w-3xl')}>
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
                    className="px-4 pt-6 pb-3 lg:px-8 lg:pt-10 lg:pb-4"
                    style={{ backgroundColor: 'var(--bg-primary)' }}
                  >
                    <AddTodoInput
                      onAdd={(title, priority) => {
                        addTodo(title, priority);
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
              <div className="space-y-5 px-4 pb-6 lg:px-8 lg:pb-10">
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
                    onClearCompleted={clearCompleted}
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
                    selectedIds={selectedIds}
                    sort={sort}
                    filter={filter}
                    hasTodos={stats.total > 0}
                    onToggle={toggleTodo}
                    onEdit={updateTodo}
                    onDelete={deleteTodo}
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

      {/* 批量操作工具栏 */}
      <BatchToolbar
        selectedCount={selectedIds.size}
        onClearSelection={clearSelection}
        onBatchComplete={() => batchAction('complete')}
        onBatchUncomplete={() => batchAction('uncomplete')}
        onBatchDelete={() => batchAction('delete')}
        onBatchSetPriority={(p: Priority) => batchAction('setPriority', p)}
      />

      {/* 设置面板 */}
      <SettingsPanel
        open={settingsOpen}
        initialSection={settingsSection}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onUpdateSettings={(updates) => useSettingsStore.getState().updateSettings(updates)}
        onExportAll={handleExportAll}
        onExportCsv={handleExportCsv}
        onImportAll={handleImportProject}
        onResetData={handleResetData}
        updateStatus={isAutoUpdateAvailable ? updateStatus : undefined}
        updateInfo={isAutoUpdateAvailable ? updateInfo : undefined}
        updateProgress={isAutoUpdateAvailable ? updateProgress : undefined}
        updateError={isAutoUpdateAvailable ? updateError : undefined}
        onCheckUpdates={isAutoUpdateAvailable ? checkForUpdates : undefined}
        onDownloadUpdate={isAutoUpdateAvailable ? downloadUpdate : undefined}
        onRestartToUpdate={isAutoUpdateAvailable ? () => void quitAndInstall() : undefined}
      />

      {/* 历史记录弹窗（归档视图，与设置弹窗独立） */}
      <HistoryPanel
        open={historyOpen}
        projects={projects}
        onRestoreTodo={restoreTodo}
        onPermanentDeleteTodo={permanentlyDelete}
        onEmptyArchive={emptyArchive}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
}

export default App;
