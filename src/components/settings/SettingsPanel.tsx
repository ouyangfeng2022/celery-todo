/**
 * @file SettingsPanel - 设置面板
 * @description 主题、通知、Electron 设置、数据导入导出
 */

import { memo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ThemeMode, AppSettings } from '../../types';
import { XIcon, DownloadIcon, UploadIcon, SunIcon, MoonIcon, MonitorIcon } from '../common/Icons';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface SettingsPanelProps {
  open: boolean;
  settings: AppSettings;
  onClose: () => void;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
  onExportAll: () => void;
  onExportCsv: () => void;
  onImportAll: (file: File) => void;
  onResetData: () => void;
}

function SettingsPanelComponent({
  open,
  settings,
  onClose,
  onUpdateSettings,
  onExportAll,
  onExportCsv,
  onImportAll,
  onResetData,
}: SettingsPanelProps) {
  const [confirmReset, setConfirmReset] = useState(false);

  const handleImportClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) onImportAll(file);
    };
    input.click();
  }, [onImportAll]);

  const themeOptions: { value: ThemeMode; label: string; icon: typeof SunIcon }[] = [
    { value: 'light', label: '浅色', icon: SunIcon },
    { value: 'dark', label: '深色', icon: MoonIcon },
    { value: 'system', label: '跟随系统', icon: MonitorIcon },
  ];

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            <motion.div
              className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl shadow-xl"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-strong)',
              }}
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
            >
              {/* 头部 */}
              <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 z-10" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}>
                <h2 className="text-lg font-serif" style={{ color: 'var(--text-primary)' }}>
                  设置
                </h2>
                <button onClick={onClose} className="btn-ghost p-1.5" aria-label="关闭">
                  <XIcon size={18} />
                </button>
              </div>

              <div className="p-5 space-y-6">
                {/* 主题 */}
                <section>
                  <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
                    外观
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {themeOptions.map((option) => {
                      const Icon = option.icon;
                      const isActive = settings.theme === option.value;
                      return (
                        <button
                          key={option.value}
                          onClick={() => onUpdateSettings({ theme: option.value })}
                          className="flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all"
                          style={{
                            borderColor: isActive ? 'var(--accent)' : 'var(--border-color)',
                            backgroundColor: isActive ? 'var(--accent-light)' : 'var(--bg-secondary)',
                          }}
                        >
                          <Icon size={20} style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }} />
                          <span className="text-xs" style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}>
                            {option.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* 通知 */}
                <section>
                  <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
                    通知
                  </h3>
                  <label className="flex items-center justify-between py-2 cursor-pointer">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      启用桌面通知
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.notificationsEnabled}
                      onChange={(e) => onUpdateSettings({ notificationsEnabled: e.target.checked })}
                      className="w-4 h-4"
                    />
                  </label>
                  {settings.notificationsEnabled && (
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        提前提醒时间
                      </span>
                      <select
                        value={settings.notificationLeadHours}
                        onChange={(e) => onUpdateSettings({ notificationLeadHours: Number(e.target.value) })}
                        className="text-sm px-2 py-1 rounded border-none"
                        style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                      >
                        <option value={1}>1 小时</option>
                        <option value={6}>6 小时</option>
                        <option value={12}>12 小时</option>
                        <option value={24}>24 小时</option>
                        <option value={48}>48 小时</option>
                      </select>
                    </div>
                  )}
                </section>

                {/* Electron 设置（仅在桌面端显示） */}
                {window.electronAPI && (
                  <section>
                    <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
                      桌面应用
                    </h3>
                    <label className="flex items-center justify-between py-2 cursor-pointer">
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        开机自启动
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.autoStart}
                        onChange={(e) => onUpdateSettings({ autoStart: e.target.checked })}
                        className="w-4 h-4"
                      />
                    </label>
                    <label className="flex items-center justify-between py-2 cursor-pointer">
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        关闭时最小化到托盘
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.minimizeToTray}
                        onChange={(e) => onUpdateSettings({ minimizeToTray: e.target.checked })}
                        className="w-4 h-4"
                      />
                    </label>
                  </section>
                )}

                {/* 数据管理 */}
                <section>
                  <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
                    数据管理
                  </h3>
                  <div className="space-y-2">
                    <button
                      onClick={onExportAll}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
                    >
                      <DownloadIcon size={16} />
                      导出全部数据 (JSON)
                    </button>
                    <button
                      onClick={onExportCsv}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
                    >
                      <DownloadIcon size={16} />
                      导出当前项目 (CSV)
                    </button>
                    <button
                      onClick={handleImportClick}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
                    >
                      <UploadIcon size={16} />
                      导入数据 (JSON)
                    </button>
                    <button
                      onClick={() => setConfirmReset(true)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors hover:bg-[var(--danger-light)]"
                      style={{ color: 'var(--danger)', backgroundColor: 'var(--bg-secondary)' }}
                    >
                      重置所有数据
                    </button>
                  </div>
                </section>

                {/* 快捷键说明 */}
                <section>
                  <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
                    键盘快捷键
                  </h3>
                  <div className="space-y-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {[
                      ['Ctrl + N', '新建事项'],
                      ['Ctrl + F', '搜索'],
                      ['Ctrl + S', '保存'],
                      ['Ctrl + B', '切换侧边栏'],
                      ['Ctrl + D', '切换主题'],
                      ['Ctrl + 1/2/3', '切换筛选视图'],
                      ['Esc', '取消编辑'],
                    ].map(([key, desc]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span>{desc}</span>
                        <kbd className="px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}>
                          {key}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmReset}
        title="重置所有数据"
        message="此操作将永久删除所有项目、事项和设置，且无法恢复。建议先导出备份。确定继续吗？"
        confirmText="永久重置"
        danger
        onConfirm={() => {
          onResetData();
          setConfirmReset(false);
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </>
  );
}

export const SettingsPanel = memo(SettingsPanelComponent);
