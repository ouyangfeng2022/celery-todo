/**
 * @file SettingsPanel - 设置页面（页面壳 + 左侧导航 + 右侧内容路由）
 * @description
 *   使用与主界面相同的「暖橙 T 型框架 + 圆角纸张工作区」：
 *     - 左侧 280px 品牌栏与分类导航
 *     - 顶部品牌标题栏，为原生窗口按钮预留空间
 *     - 右侧圆角工作区承载设置卡片
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
        >
          {/* 顶部品牌栏：宽度、底色和原生窗口按钮留白均与主页面一致。 */}
          <div className="flex flex-shrink-0">
            <div className="relative flex h-[60px] w-[280px] flex-shrink-0 items-center px-3">
              <button
                onClick={onClose}
                className="titlebar-no-drag flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-active)]"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="返回待办"
                title="返回待办 (Esc)"
              >
                <Icons.ChevronLeftIcon size={16} />
              </button>
              <span
                className="brand-wordmark ml-3 flex items-center gap-[0.35em] truncate text-base"
                style={{ color: 'var(--text-primary)' }}
              >
                <span className="italic">Celery</span>
                <span
                  aria-hidden="true"
                  className="h-[5px] w-[5px] flex-shrink-0 rounded-full"
                  style={{ backgroundColor: 'var(--accent)' }}
                />
                <span>Todo</span>
              </span>
            </div>

            <header className="relative flex min-w-0 flex-1 items-center px-7 pr-[152px]">
              <div
                aria-hidden="true"
                className="titlebar-drag pointer-events-auto absolute inset-y-0 left-0 right-[152px]"
              />
              <div className="titlebar-no-drag relative z-10 min-w-0">
                <p className="claude-eyebrow mb-0.5">偏好设置</p>
                <h1
                  className="truncate text-lg font-serif font-semibold leading-tight"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {activeNavItem.label}
                </h1>
              </div>
            </header>
          </div>

          <div className="flex min-h-0 flex-1">
            {/* 左侧分类栏复用主页面侧栏的宽度、暖橙底色与列表节奏。 */}
            <nav
              className="flex w-[280px] flex-shrink-0 flex-col overflow-y-auto px-3 pb-4 pt-1"
              aria-label="设置分类"
            >
              <div className="mb-2 flex items-center justify-between px-2">
                <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  设置
                </span>
              </div>
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
              </motion.div>
            </main>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

export const SettingsPanel = memo(SettingsPanelComponent);
