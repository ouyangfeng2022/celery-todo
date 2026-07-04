/**
 * @file App - 应用根组件
 * @description 组合所有组件，管理全局状态和布局
 */

import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

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
import { RecycleBinModal } from './components/recycle/RecycleBinModal';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { FocusIcon, ChevronLeftIcon, ChevronRightIcon } from './components/common/Icons';
import { Logo } from './components/common/Logo';

import * as db from './utils/database';
import { exportAppAsJson, exportProjectAsJson, parseImportData, todosToCsv } from './utils/export';
import { cn, downloadFile, readFileAsText } from './utils/helpers';
import type { Priority } from './types';

function App() {
  // === 初始化数据库 ===
  const [dbReady, setDbReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newTodoFocusSignal, setNewTodoFocusSignal] = useState(0);
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
  // 专注模式下 AddTodoInput 默认隐藏，Ctrl+N 临时唤出；添加完成或 Esc 后回隐藏
  const [composerVisible, setComposerVisible] = useState(false);

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
    restoreTodo,
    permanentlyDelete,
    emptyRecycleBin,
  } = useTodos();
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } =
    useNotification();

  // === 筛选 ===
  const { filter, sort, search, filteredTodos, stats, changeFilter, changeSort, changeSearch } =
    useFilter(todos);

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
      setRecycleBinOpen(false);
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
          useTodoStore.getState().loadProject(useProjectStore.getState().activeProjectId);
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
    useTodoStore.getState().loadProject('default');
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

  const isDark = document.documentElement.classList.contains('dark');

  return (
    <div className="h-full flex" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/*
        侧边栏 + 切换手柄
        - 用一个 group 容器把侧边栏与手柄圈在一起，鼠标悬浮在整个区域时手柄淡入
        - 专注模式下完全隐藏（专注模式有自己的退出入口，不需要再露出手柄）
        - 手柄本身是简单的箭头：展开时左箭头（点击收起），收起时右箭头（点击展开）
      */}
      <div className="group/sidebar relative flex-shrink-0">
        {/* 侧边栏 */}
        <AnimatePresence>
          {sidebarOpen && !focusMode && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <ProjectSidebar
                projects={projects}
                activeProjectId={activeProjectId}
                onSwitch={switchProject}
                onCreate={createProject}
                onRename={renameProject}
                onDelete={deleteProject}
                onExport={handleExportProject}
                onImport={handleImportProject}
                onOpenRecycleBin={() => setRecycleBinOpen(true)}
                onOpenSettings={() => setSettingsOpen(true)}
                recycleBinCount={deletedTodos.length}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 侧边栏收起手柄：侧边栏展开时贴在右侧边缘，鼠标悬浮在侧边栏区域才出现 */}
        {sidebarOpen && !focusMode && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="titlebar-no-drag absolute top-1/2 -translate-y-1/2 -right-3 z-20 flex items-center justify-center w-6 h-12 rounded-md opacity-0 group-hover/sidebar:opacity-100 transition-opacity"
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

      {/*
        侧边栏收起后：在主内容区左边缘留一条窄的悬停热区，鼠标移过去时淡出"展开"手柄。
        热区无视觉干扰，但提供明确的展开入口。
      */}
      {!sidebarOpen && !focusMode && (
        <div className="group/expand relative flex-shrink-0">
          {/* 隐形热区：宽度极窄，仅作 hover 触发器 */}
          <div className="absolute inset-y-0 -right-2 w-4 z-20" aria-hidden />
          <button
            onClick={() => setSidebarOpen(true)}
            className="titlebar-no-drag absolute top-1/2 -translate-y-1/2 left-0 z-30 flex items-center justify-center w-6 h-12 rounded-md opacity-0 group-hover/expand:opacity-100 transition-opacity"
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

      {/* 主内容区 */}
      <div className="relative flex-1 flex flex-col min-w-0">
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
            isDark={isDark}
            onToggleTheme={toggleTheme}
            onOpenSettings={() => setSettingsOpen(true)}
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

            {/* 事项列表 */}
            <TodoList
              todos={filteredTodos}
              selectedIds={selectedIds}
              sort={sort}
              onToggle={toggleTodo}
              onEdit={updateTodo}
              onDelete={deleteTodo}
              onToggleSelect={toggleSelected}
              onReorder={reorderTodos}
            />
          </div>
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

      {/* 回收站 */}
      <RecycleBinModal
        open={recycleBinOpen}
        deletedTodos={deletedTodos}
        onRestore={restoreTodo}
        onPermanentDelete={permanentlyDelete}
        onEmptyAll={emptyRecycleBin}
        onClose={() => setRecycleBinOpen(false)}
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
      />
    </div>
  );
}

export default App;
