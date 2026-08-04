/**
 * @file SettingsPanel - 设置页面（页面壳 + 左侧导航 + 右侧内容路由）
 * @description
 *   使用与主界面相同的「暖橙 T 型框架 + 圆角纸张工作区」：
 *     - 顶部行直接复用主页面 <Header/> 工具组(侧栏开关/项目/数据/窗口菜单/搜索),
 *       仅在最左加返回箭头,标题区显示当前分类名 —— 与主页面顶部栏像素级一致。
 *     - 左侧 280px 分类导航
 *     - 右侧圆角工作区承载设置卡片
 *   各分类的具体 UI 拆到 ./sections/ 下,本文件只负责弹窗骨架、导航与子页面分发。
 */

import { memo, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AppSettings, DeletedTodo, Project } from '../../types';
import * as Icons from '../common/Icons';
import { Header } from '../layout/Header';
import type { UpdateStatus, UpdateInfoLite, DownloadProgress } from '@/hooks/useAutoUpdate';
import { GeneralSection } from './sections/GeneralSection';
import { StickerSection } from './sections/StickerSection';
import { DesktopSection } from './sections/DesktopSection';
import { DataSection } from './sections/DataSection';
import { HistorySection } from './sections/HistorySection';
import { ShortcutsSection } from './sections/ShortcutsSection';
import { AboutSection } from './sections/AboutSection';

/** 子页面 id。desktop 仅在桌面端渲染入口，故路由层 union 包含但导航项条件渲染。 */
export type SettingsSectionId =
  'general' | 'sticker' | 'desktop' | 'data' | 'history' | 'shortcuts' | 'about';

interface SettingsPanelProps {
  open: boolean;
  initialSection?: SettingsSectionId;
  settings: AppSettings;
  onClose: () => void;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
  onExportAll: () => void;
  onExportCsv: () => void;
  onImportAll: (file: File) => void;
  onResetData: () => void;
  // ===== 顶部 Header 工具组(与主页面 App.tsx 接线一致) =====
  sidebarOpen: boolean;
  search: string;
  onToggleSidebar: () => void;
  onSearchChange: (value: string) => void;
  onCreateProject: () => void;
  onEnterCompactMode: () => void;
  onCloseWindow: () => void;
  // ===== 已归档事项页面所需 =====
  /** 全部项目（历史记录页解析项目名标签） */
  projects: Project[];
  /** 恢复归档事项 */
  onRestoreTodo: (todo: DeletedTodo) => void;
  /** 永久删除归档事项 */
  onPermanentDeleteTodo: (id: string) => void;
  /** 清空全部归档 */
  onEmptyArchive: () => void;
  /** 导出全量归档为 JSON 快照（只读，不可导回） */
  onExportHistory: () => void;
  // ===== 自动升级（仅桌面端；Web 下 undefined，UI 不渲染升级行） =====
  updateStatus?: UpdateStatus;
  updateInfo?: UpdateInfoLite | null;
  updateProgress?: DownloadProgress | null;
  updateError?: string;
  onCheckUpdates?: () => void;
  onDownloadUpdate?: () => void;
  /** 更新已下载后触发重启安装（downloaded / dismissed 状态共用） */
  onRestartToUpdate?: () => void;
}

// 左侧导航项定义。desktop 仅桌面端渲染，其余始终存在。
// 图标类型直接借用现有图标的类型，避免 React 19 memo/ComponentType ref 兼容问题。
const NAV_ITEMS: { id: SettingsSectionId; label: string; icon: typeof Icons.SettingsIcon }[] = [
  { id: 'general', label: '通用', icon: Icons.SettingsIcon },
  { id: 'sticker', label: '贴图', icon: Icons.StickerIcon },
  { id: 'desktop', label: '桌面', icon: Icons.MonitorIcon },
  { id: 'data', label: '数据', icon: Icons.FolderIcon },
  { id: 'history', label: '已归档事项', icon: Icons.ArchiveIcon },
  { id: 'shortcuts', label: '快捷键', icon: Icons.KeyboardIcon },
  { id: 'about', label: '关于', icon: Icons.GithubIcon },
];

function SettingsPanelComponent({
  open,
  initialSection = 'general',
  settings,
  onClose,
  onUpdateSettings,
  onExportAll,
  onExportCsv,
  onImportAll,
  onResetData,
  sidebarOpen,
  search,
  onToggleSidebar,
  onSearchChange,
  onCreateProject,
  onEnterCompactMode,
  onCloseWindow,
  projects,
  onRestoreTodo,
  onPermanentDeleteTodo,
  onEmptyArchive,
  onExportHistory,
  updateStatus = 'idle',
  updateInfo = null,
  updateProgress = null,
  updateError = '',
  onCheckUpdates,
  onDownloadUpdate,
  onRestartToUpdate,
}: SettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('general');

  // 左下角设置菜单可以直接打开指定分类；普通入口默认进入「通用」。
  useEffect(() => {
    if (open) setActiveSection(initialSection);
  }, [initialSection, open]);

  // Esc 关闭（沿用原行为，ConfirmDialog 内部也会消费 Esc —— 但弹窗未开时这里兜底）
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  // 导入统一「先关设置页」:无论从 Header「数据」菜单还是 DataSection 触发,
  // 导入成功后的数据刷新反馈都在主页面(被设置页浮层遮盖),故先关设置页让结果可见。
  // Header 的 onImport 与 DataSection 的 onImportAll 共用此包装。
  const handleImportWithClose = useCallback(
    (file: File) => {
      onClose();
      onImportAll(file);
    },
    [onClose, onImportAll],
  );

  // 导航项（desktop 仅桌面端可见）
  const navItems = NAV_ITEMS.filter((item) => item.id !== 'desktop' || window.electronAPI);
  const activeNavItem = navItems.find((item) => item.id === activeSection) ?? navItems[0];

  return (
    <AnimatePresence mode="wait">
      {open && (
        <motion.section
          className="fixed inset-0 z-50 flex min-h-0 flex-col"
          style={{ backgroundColor: 'var(--bg-frame)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onKeyDown={handleKeyDown}
          aria-label="设置"
        >
          {/* 顶部行:复用主页面 <Header/> 工具组 + 分类标题区,与主页面顶部栏像素级一致。
              左 280px 容器挂 Header(与主页面完全相同的工具组,不再有返回箭头),
              右侧标题区按主页面标题区结构(拖拽区 + h1 + 右侧拖拽留白),
              仅把项目名换成当前分类名。
              返回按钮改放在左侧导航栏顶部(原"设置"二字位置)。 */}
          <div className="flex flex-shrink-0">
            <div className="relative h-full w-[280px] flex-shrink-0">
              <Header
                sidebarOpen={sidebarOpen}
                search={search}
                // 设置页里搜索结果会落回主页面 TodoList(被浮层遮盖),搜索无意义,
                // 故既不渲染搜索按钮,也不响应外部搜索信号。
                showSearch={false}
                searchFocusSignal={0}
                onToggleSidebar={onToggleSidebar}
                onSearchChange={onSearchChange}
                onImport={handleImportWithClose}
                onExportAll={onExportAll}
                onExportCsv={onExportCsv}
                onCreateProject={onCreateProject}
                onEnterCompactMode={onEnterCompactMode}
                onCloseWindow={onCloseWindow}
              />
            </div>

            {/*
              标题区:结构与主页面 App.tsx 标题区对齐。pr-[152px] 给原生 overlay 让位,
              拖拽区铺满标题左侧到原生按钮之间的空白。背景 --bg-frame,与 Header 合成完整顶部栏。
            */}
            <div
              className="relative flex h-full flex-1 items-center gap-3 px-7 pr-[152px]"
              style={{ backgroundColor: 'var(--bg-frame)' }}
            >
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
                  {activeNavItem.label}
                </h1>
              </div>
              <div className="titlebar-no-drag relative z-10 ml-auto flex items-center gap-0.5" />
            </div>
          </div>

          <div className="flex min-h-0 flex-1">
            {/* 左侧分类栏复用主页面侧栏的宽度、暖橙底色与列表节奏。 */}
            <nav
              className="flex w-[280px] flex-shrink-0 flex-col overflow-y-auto px-3 pb-4 pt-1"
              aria-label="设置分类"
            >
              {/* 返回按钮:复用原"设置"二字的位置,作为左侧导航栏的入口动作。
                  用整行按钮而非纯图标,保留与下方导航项一致的视觉节奏。 */}
              <button
                onClick={onClose}
                className="titlebar-no-drag mb-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all hover:bg-[var(--bg-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="返回待办"
                title="返回待办 (Esc)"
              >
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg">
                  <Icons.ChevronLeftIcon size={16} />
                </span>
                <span className="font-semibold">返回</span>
              </button>
              <div className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all hover:bg-[var(--bg-active)]"
                      style={{
                        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                        backgroundColor: isActive ? 'var(--bg-tertiary)' : undefined,
                        boxShadow: isActive ? 'var(--shadow-xs)' : undefined,
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      <span
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-colors group-hover:bg-[var(--accent-subtle)]"
                        style={{
                          backgroundColor: isActive ? 'var(--accent-subtle)' : 'transparent',
                          color: isActive ? 'var(--accent)' : 'var(--text-tertiary)',
                        }}
                      >
                        <Icon size={15} />
                      </span>
                      <span className="flex-1">{item.label}</span>
                      {isActive && (
                        <span
                          aria-hidden="true"
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: 'var(--accent)' }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="mt-auto px-3 pt-6">
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                  调整 Celery Todo 的外观、桌面行为与数据选项。
                </p>
              </div>
            </nav>

            {/* 右侧沿用主页面的圆角暖纸工作区。 */}
            <main
              className="workspace-surface min-w-0 flex-1 overflow-y-auto"
              style={{ backgroundColor: 'var(--bg-primary)' }}
            >
              <motion.div
                key={activeSection}
                className="settings-content mx-auto w-full max-w-3xl px-7 py-8 lg:px-10 lg:py-10"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                {activeSection === 'general' && (
                  <GeneralSection
                    theme={settings.theme}
                    colorMode={settings.colorMode}
                    onUpdateSettings={onUpdateSettings}
                  />
                )}

                {activeSection === 'sticker' && (
                  <StickerSection
                    preset={settings.stickerPreset}
                    onUpdateSettings={onUpdateSettings}
                  />
                )}

                {activeSection === 'desktop' && (
                  <DesktopSection
                    autoStart={settings.autoStart}
                    minimizeToTray={settings.minimizeToTray}
                    autoUpdateEnabled={settings.autoUpdateEnabled}
                    onUpdateSettings={onUpdateSettings}
                  />
                )}

                {activeSection === 'data' && (
                  <DataSection
                    onExportAll={onExportAll}
                    onExportCsv={onExportCsv}
                    onImportAll={handleImportWithClose}
                    onResetData={onResetData}
                  />
                )}

                {activeSection === 'history' && (
                  <HistorySection
                    projects={projects}
                    onRestoreTodo={onRestoreTodo}
                    onPermanentDeleteTodo={onPermanentDeleteTodo}
                    onEmptyArchive={onEmptyArchive}
                    onExportHistory={onExportHistory}
                  />
                )}

                {activeSection === 'shortcuts' && <ShortcutsSection />}

                {activeSection === 'about' && (
                  <AboutSection
                    updateStatus={updateStatus}
                    updateInfo={updateInfo}
                    updateProgress={updateProgress}
                    updateError={updateError}
                    onCheckUpdates={onCheckUpdates ?? (() => undefined)}
                    onDownloadUpdate={onDownloadUpdate ?? (() => undefined)}
                    onRestartToUpdate={onRestartToUpdate ?? (() => undefined)}
                  />
                )}
              </motion.div>
            </main>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

export const SettingsPanel = memo(SettingsPanelComponent);
