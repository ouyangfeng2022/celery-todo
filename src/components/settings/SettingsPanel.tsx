/**
 * @file SettingsPanel - 设置页面（页面壳 + 左侧导航 + 右侧内容路由）
 * @description
 *   v2.5 重构：从单个滚动长列表改为「左侧分类导航 + 右侧子页面」结构。
 *   整体布局与主界面 (App.tsx) 完全一致：
 *     - 左侧 256px 全高导航栏（border-r、bg-secondary、顶部 pt-14 给浮动按钮让位）
 *     - 右侧 flex-col：顶部 Header（border-b + 分类标题）+ 下方可滚动 main
 *     - 返回按钮浮在左上角 (absolute left-2 top-2)，对应主界面 AppToolbar
 *   各分类的具体 UI 拆到 ./sections/ 下，本文件只负责弹窗骨架、导航与子页面分发。
 *   props 契约与之前完全一致，App.tsx 接线无需改动。
 */

import { memo, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AppSettings } from '../../types';
import * as Icons from '../common/Icons';
import type { UpdateStatus, UpdateInfoLite, DownloadProgress } from '@/hooks/useAutoUpdate';
import { GeneralSection } from './sections/GeneralSection';
import { StickerSection } from './sections/StickerSection';
import { DesktopSection } from './sections/DesktopSection';
import { DataSection } from './sections/DataSection';
import { ShortcutsSection } from './sections/ShortcutsSection';
import { AboutSection } from './sections/AboutSection';

/** 子页面 id。desktop 仅在桌面端渲染入口，故路由层 union 包含但导航项条件渲染。 */
export type SettingsSectionId = 'general' | 'sticker' | 'desktop' | 'data' | 'shortcuts' | 'about';

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

  // 导航项（desktop 仅桌面端可见）
  const navItems = NAV_ITEMS.filter((item) => item.id !== 'desktop' || window.electronAPI);

  return (
    <AnimatePresence mode="wait">
      {open && (
        <motion.section
          className="fixed inset-0 z-50 flex min-h-0"
          style={{ backgroundColor: 'var(--bg-primary)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onKeyDown={handleKeyDown}
        >
          {/*
            整体结构与主界面 (App.tsx) 完全对齐：
            ┌──────────┬──────────────────────────────────┐
            │          │  Header（border-b + 当前分类名）  │
            │ 左侧栏    ├──────────────────────────────────┤
            │ (border-r)│  main 可滚动                     │
            └──────────┴──────────────────────────────────┘
            左上角返回按钮模仿主界面 AppToolbar（absolute left-2 top-2），
            左侧栏顶部预留 pt-14 给它，整体不破坏主界面那一套空间感。
          */}
          {/* 浮动返回按钮（与主界面 AppToolbar 同位） */}
          <button
            onClick={onClose}
            className="titlebar-no-drag pointer-events-auto absolute left-2 top-2 z-50 flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="返回待办"
            title="返回待办 (Esc)"
          >
            <Icons.ChevronLeftIcon size={16} />
          </button>

          {/* 左侧导航 —— 全高、border-r、bg-secondary，与主界面 ProjectSidebar 一致 */}
          <nav
            className="w-64 flex-shrink-0 overflow-y-auto border-r"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="flex-1 px-3 pb-4 pt-14">
              <div className="mb-2 flex items-center justify-between px-2">
                <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  设置
                </span>
              </div>
              <div className="mt-1 space-y-0.5">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left rounded-md transition-colors"
                      style={{
                        color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                        backgroundColor: isActive ? 'var(--accent-subtle)' : 'transparent',
                        fontWeight: isActive ? 500 : 400,
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <Icon size={15} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>

          {/* 右侧主区：Header（border-b + 分类标题）+ 可滚动 main，与主界面 Header/main 一致 */}
          <div className="relative flex min-w-0 flex-1 flex-col">
            <header
              className="flex items-center gap-3 border-b px-5 py-3.5"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border-color)',
              }}
            >
              <div className="relative flex min-w-0 items-center gap-2">
                <h1
                  className="truncate font-serif text-xl tracking-tight"
                  style={{ color: 'var(--text-primary)' }}
                >
                  设置
                </h1>
              </div>
            </header>

            <main className="min-w-0 flex-1 overflow-y-auto px-5 py-6 lg:pr-8">
              <div className="mx-auto w-full max-w-xl">
                {activeSection === 'general' && (
                  <GeneralSection theme={settings.theme} onUpdateSettings={onUpdateSettings} />
                )}

                {activeSection === 'sticker' && (
                  <StickerSection
                    preset={settings.stickerPreset}
                    radius={settings.stickerRadius}
                    blur={settings.stickerBlur}
                    opacity={settings.stickerOpacity}
                    shadow={settings.stickerShadow}
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
                    onImportAll={onImportAll}
                    onResetData={onResetData}
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
              </div>
            </main>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

export const SettingsPanel = memo(SettingsPanelComponent);
