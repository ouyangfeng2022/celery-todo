/**
 * @file SettingsPanel - 设置面板（壳 + 左侧导航 + 右侧内容路由）
 * @description
 *   v2.5 重构：从单个滚动长列表改为「左侧分类导航 + 右侧子页面」结构。
 *   各分类的具体 UI 拆到 ./sections/ 下，本文件只负责弹窗骨架、导航与子页面分发。
 *   props 契约与之前完全一致，App.tsx 接线无需改动。
 */

import { memo, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AppSettings } from '../../types';
import * as Icons from '../common/Icons';
import { Logo } from '../common/Logo';
import type { UpdateStatus, UpdateInfoLite, DownloadProgress } from '@/hooks/useAutoUpdate';
import { GeneralSection } from './sections/GeneralSection';
import { StickerSection } from './sections/StickerSection';
import { DesktopSection } from './sections/DesktopSection';
import { DataSection } from './sections/DataSection';
import { ShortcutsSection } from './sections/ShortcutsSection';
import { AboutSection } from './sections/AboutSection';

/** 子页面 id。desktop 仅在桌面端渲染入口，故路由层 union 包含但导航项条件渲染。 */
type SectionId = 'general' | 'sticker' | 'desktop' | 'data' | 'shortcuts' | 'about';

interface SettingsPanelProps {
  open: boolean;
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
const NAV_ITEMS: { id: SectionId; label: string; icon: typeof Icons.SettingsIcon }[] = [
  { id: 'general', label: '通用', icon: Icons.SettingsIcon },
  { id: 'sticker', label: '贴图', icon: Icons.StickerIcon },
  { id: 'desktop', label: '桌面', icon: Icons.MonitorIcon },
  { id: 'data', label: '数据', icon: Icons.FolderIcon },
  { id: 'shortcuts', label: '快捷键', icon: Icons.KeyboardIcon },
  { id: 'about', label: '关于', icon: Icons.GithubIcon },
];

function SettingsPanelComponent({
  open,
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
  const [activeSection, setActiveSection] = useState<SectionId>('general');

  // 每次打开重置到「通用」子页面，避免上次会话停留在已失效的状态
  useEffect(() => {
    if (open) setActiveSection('general');
  }, [open]);

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
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onKeyDown={handleKeyDown}
        >
          <div
            className="absolute inset-0 backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(47, 45, 39, 0.4)' }}
            onClick={onClose}
          />

          <motion.div
            className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-claude flex flex-col"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-lg)',
            }}
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* 头部 */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Logo size={26} className="flex-shrink-0" />
                <h2
                  className="text-xl font-serif font-semibold leading-none"
                  style={{ color: 'var(--text-primary)' }}
                >
                  设置
                </h2>
              </div>
              <button onClick={onClose} className="btn-ghost p-1.5" aria-label="关闭">
                <Icons.XIcon size={18} />
              </button>
            </div>

            {/* 主体：左侧导航 + 右侧内容 */}
            <div className="flex flex-1 min-h-0">
              {/* 左侧导航 */}
              <nav
                className="w-44 flex-shrink-0 p-3 space-y-0.5 border-r overflow-y-auto"
                style={{
                  borderColor: 'var(--border-color)',
                  backgroundColor: 'var(--bg-secondary)',
                }}
              >
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors text-left"
                      style={{
                        color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                        backgroundColor: isActive ? 'var(--accent-subtle)' : 'transparent',
                        fontWeight: isActive ? 600 : 400,
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <Icon size={16} />
                      {item.label}
                    </button>
                  );
                })}
              </nav>

              {/* 右侧内容（子页面） */}
              <main className="flex-1 min-w-0 overflow-y-auto p-6">
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
              </main>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const SettingsPanel = memo(SettingsPanelComponent);
