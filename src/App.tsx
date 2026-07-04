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

import * as db from './utils/database';
import { exportAppAsJson, exportProjectAsJson, parseImportData, todosToCsv } from './utils/export';
import { downloadFile, readFileAsText } from './utils/helpers';
import type { Priority } from './types';

function App() {
  // === 初始化数据库 ===
  const [dbReady, setDbReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newTodoFocusSignal, setNewTodoFocusSignal] = useState(0);
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);

  // === Stores ===
  const settings = useSettingsStore();
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
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotification();

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
    onNewTodo: () => setNewTodoFocusSignal((n) => n + 1),
    onSearch: () => setSearchFocusSignal((n) => n + 1),
    onSave: () => {
      db.flushSave();
    },
    onToggleSidebar: () => setSidebarOpen((s) => !s),
    onToggleTheme: toggleTheme,
    onFilterAll: () => changeFilter('all'),
    onFilterActive: () => changeFilter('active'),
    onFilterCompleted: () => changeFilter('completed'),
    onEscape: () => {
      clearSelection();
      setRecycleBinOpen(false);
      setSettingsOpen(false);
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

  const handleImportProject = useCallback(async (file: File) => {
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
  }, [createProject, switchProject, loadProjects]);

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
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: 'var(--accent)',
                boxShadow: '0 4px 12px -2px rgba(217, 119, 87, 0.4)',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="white"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="text-xl font-serif tracking-tight" style={{ color: 'var(--text-primary)' }}>
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
      {/* 侧边栏 */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'auto', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0 overflow-hidden"
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

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col min-w-0">
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
          onToggleSidebar={() => setSidebarOpen((s) => !s)}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 lg:py-10">
          <div className="max-w-3xl mx-auto space-y-5">
            {/* 添加事项 */}
            <AddTodoInput onAdd={addTodo} focusSignal={newTodoFocusSignal} />

            {/* 统计 */}
            <StatsPanel
              total={stats.total}
              completed={stats.completed}
              active={stats.active}
              overdue={stats.overdue}
              percentage={stats.percentage}
            />

            {/* 筛选栏 */}
            <FilterBar
              filter={filter}
              sort={sort}
              activeCount={stats.active}
              completedCount={stats.completed}
              onFilterChange={changeFilter}
              onSortChange={changeSort}
              onClearCompleted={clearCompleted}
            />

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
