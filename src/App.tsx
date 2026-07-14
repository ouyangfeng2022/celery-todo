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
import { useNotificationStore } from './store/useNotificationStore';

import { useTodos } from './hooks/useTodos';
import { useProjects } from './hooks/useProjects';
import { useFilter } from './hooks/useFilter';
import { useTheme } from './hooks/useTheme';
import { useNotification } from './hooks/useNotification';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

import { Header } from './components/layout/Header';
import { ProjectSidebar } from './components/projects/ProjectSidebar';
import { AddTodoInput } from './components/todos/AddTodoInput';
import { FilterBar } from './components/filters/FilterBar';
import { StatsPanel } from './components/stats/StatsPanel';
import { TodoList } from './components/todos/TodoList';
import { BatchToolbar } from './components/todos/BatchToolbar';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { HistoryPanel } from './components/settings/HistoryPanel';
import { ConfirmDialog } from './components/common/ConfirmDialog';
import { NoProjectsState } from './components/common/NoProjectsState';
import { AllDoneCelebration } from './components/common/AllDoneCelebration';
import { FocusIcon, ChevronLeftIcon, ChevronRightIcon } from './components/common/Icons';
import { Logo } from './components/common/Logo';

import { useAutoUpdate } from './hooks/useAutoUpdate';

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
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } =
    useNotification();

  // === 自动升级（仅桌面端） ===
  const {
    isDesktop: isAutoUpdateAvailable,
    status: updateStatus,
    updateInfo,
    progress: updateProgress,
    errorMsg: updateError,
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
    dismissDownloaded,
  } = useAutoUpdate({ dbReady });

  // === 筛选 ===
  const { filter, sort, search, filteredTodos, stats, changeFilter, changeSort, changeSearch } =
    useFilter(todos, activeProjectId);

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

  // === 全部归档事项（历史记录页跨项目展示） ===
  // useTodoStore.deletedTodos 只含当前项目；历史记录页需展示全部归档，故全量取。
  // deletedTodos 作为 store 变更信号驱动重算（归档/恢复/清空都会改变其引用）。
  const allArchivedTodos = useMemo<ReturnType<typeof db.getAllDeletedTodos>>(
    () => {
      if (!dbReady) return [];
      return db.getAllDeletedTodos();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deletedTodos 作为变更信号
    [deletedTodos, dbReady],
  );

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
      useNotificationStore.getState().loadNotifications();
      const activeId = useProjectStore.getState().activeProjectId;
      useTodoStore.getState().loadProject(activeId);
      setDbReady(true);
    })();
  }, []);

  // === 项目切换时重新加载 ===
  useEffect(() => {
    if (dbReady && activeProjectId) {
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
    onToggleFocusMode: () =>
      useSettingsStore.getState().setFocusMode(!useSettingsStore.getState().focusMode),
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
              className="text-xl font-serif tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              Celery Todo
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
      {/*
        侧边栏 - 专注模式下完全隐藏（直接不渲染）
        动画策略：用纯 CSS transition 控制 width 0 ↔ 256px，而不是 framer-motion。
        - 容器始终挂载，避免挂载/卸载与 exit 动画的协调问题
        - 内层 .sidebar-inner 固定 256px，<aside> 始终保持完整背景
        - 外层 transition: width 220ms，浏览器原生实现，行为可预测
        收起时 overflow-hidden 把固定宽度的内层从右向左裁剪。
      */}
      {!focusMode && (
        <div
          className="group/sidebar relative flex-shrink-0 overflow-hidden h-full"
          style={{
            width: sidebarOpen ? '256px' : '0px',
            transition: 'width 220ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
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
              onImport={handleImportProject}
              onReorder={reorderProjects}
              onOpenHistory={() => setHistoryOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
              archiveCount={allArchivedTodos.length}
              incompleteCounts={incompleteCounts}
              autofocusCreateSignal={createProjectSignal}
            />
          </div>

          {/* 收起手柄：贴在侧边栏右边缘，鼠标悬浮在侧边栏区域时淡入 */}
          {sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="titlebar-no-drag absolute top-1/2 -translate-y-1/2 right-1 z-20 flex items-center justify-center w-6 h-12 rounded-md opacity-0 group-hover/sidebar:opacity-100 focus:opacity-100 transition-opacity"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
              }}
              aria-label="收起侧边栏"
              title="收起侧边栏 (Ctrl+B)"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              <ChevronLeftIcon size={16} />
            </button>
          )}
        </div>
      )}

      {/* 主内容区 */}
      <div className="relative flex-1 flex flex-col min-w-0">
        {/*
          展开入口：侧边栏收起时，在主内容区左缘留一条窄的隐形热区（group/expand），
          鼠标移近左缘即淡入右箭头手柄；不在整个主区悬浮时触发，避免误闪。
        */}
        {!sidebarOpen && !focusMode && (
          <div className="group/expand absolute inset-y-0 left-0 w-6 z-30" aria-hidden="true">
            <button
              onClick={() => setSidebarOpen(true)}
              className="titlebar-no-drag absolute top-1/2 -translate-y-1/2 left-1 flex items-center justify-center w-6 h-12 rounded-md opacity-0 group-hover/expand:opacity-100 focus:opacity-100 transition-opacity"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
              }}
              aria-label="展开侧边栏"
              title="展开侧边栏 (Ctrl+B)"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              <ChevronRightIcon size={16} />
            </button>
          </div>
        )}

        {/* Header - 专注模式下隐藏，由右上角浮动指示器代替 */}
        {!focusMode && (
          <Header
            project={activeProject}
            search={search}
            onSearchChange={changeSearch}
            searchFocusSignal={searchFocusSignal}
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkAsRead={markAsRead}
            onMarkAllAsRead={markAllAsRead}
            onDeleteNotification={deleteNotification}
            focusMode={focusMode}
            onToggleFocusMode={() => useSettingsStore.getState().setFocusMode(!focusMode)}
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
          </>
        )}

        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 lg:py-10">
          {projects.length === 0 ? (
            // 无项目：引导创建第一个项目（优先于专注模式判断）
            <div className="mx-auto max-w-3xl">
              <NoProjectsState
                onCreate={() => {
                  // 专注模式下侧边栏被隐藏，先退出专注以露出新建输入框
                  if (focusMode) useSettingsStore.getState().setFocusMode(false);
                  setCreateProjectSignal((n) => n + 1);
                }}
              />
            </div>
          ) : (
            <div className={cn('mx-auto space-y-5', focusMode ? 'max-w-2xl' : 'max-w-3xl')}>
              {/* 添加事项：完整模式始终可见；专注模式仅 Ctrl+N 唤出时可见 */}
              {(!focusMode || composerVisible) && (
                <AddTodoInput
                  onAdd={(title, priority, dueDate) => {
                    addTodo(title, priority, dueDate);
                    // 专注模式下添加完成后收起 composer
                    if (focusMode) setComposerVisible(false);
                  }}
                  focusSignal={newTodoFocusSignal}
                />
              )}

              {/* 统计 - 专注模式下隐藏 */}
              {!focusMode && (
                <StatsPanel
                  total={stats.total}
                  completed={stats.completed}
                  active={stats.active}
                  overdue={stats.overdue}
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
                <AllDoneCelebration completed={stats.completed} onRestore={handleAllDoneRestore} />
              ) : (
                <TodoList
                  todos={filteredTodos}
                  selectedIds={selectedIds}
                  sort={sort}
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
        archivedTodos={allArchivedTodos}
        projects={projects}
        onRestoreTodo={restoreTodo}
        onPermanentDeleteTodo={permanentlyDelete}
        onEmptyArchive={emptyArchive}
        onClose={() => setHistoryOpen(false)}
      />

      {/* 升级已就绪：全局提示重启安装 */}
      <ConfirmDialog
        open={isAutoUpdateAvailable && updateStatus === 'downloaded'}
        title="更新已就绪"
        message={
          updateInfo
            ? `新版本 v${updateInfo.version} 已下载完成，是否立即重启以完成安装？`
            : '新版本已下载完成，是否立即重启以完成安装？'
        }
        confirmText="立即重启"
        cancelText="稍后"
        onConfirm={() => void quitAndInstall()}
        onCancel={() => {
          // 用户选择稍后：切换到 dismissed 状态以关闭全局对话框，
          // 下次退出应用时不会自动安装（autoInstallOnAppQuit 已关闭），
          // 但 update-downloaded 事件不会再次触发；
          // 用户可在设置面板中重新触发重启。
          dismissDownloaded();
        }}
      />
    </div>
  );
}

export default App;
