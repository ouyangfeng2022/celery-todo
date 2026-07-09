/**
 * @file SettingsPanel - 设置面板
 * @description 主题、通知、Electron 设置、数据导入导出、数据存储位置
 */

import { memo, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ThemeMode, AppSettings } from '../../types';
import {
  XIcon,
  DownloadIcon,
  UploadIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  FolderIcon,
  CheckIcon,
  AlertIcon,
} from '../common/Icons';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Logo } from '../common/Logo';
import {
  getStorageInfo,
  chooseStorageDirectory,
  changeStorageDirectory,
  resetStorageDirectory,
  openStorageInFolder,
  type StorageInfo,
} from '../../utils/database';
import { APP_VERSION } from '@/utils/version';
import type { UpdateStatus, UpdateInfoLite, DownloadProgress } from '@/hooks/useAutoUpdate';

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
  updateStatus = 'idle',
  updateInfo = null,
  updateProgress = null,
  updateError = '',
  onCheckUpdates,
  onDownloadUpdate,
}: SettingsPanelProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [storageBusy, setStorageBusy] = useState(false);
  const [confirmResetStorage, setConfirmResetStorage] = useState(false);

  // 面板打开时加载存储位置信息（仅桌面端）
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const info = await getStorageInfo();
      if (!cancelled) setStorageInfo(info);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const isStorageCustomizable = storageInfo?.mode === 'electron';

  // 选择并切换存储目录
  const handleChooseStorageDir = useCallback(async () => {
    try {
      setStorageBusy(true);
      const dir = await chooseStorageDirectory();
      if (!dir) return;
      await changeStorageDirectory(dir);
      const info = await getStorageInfo();
      setStorageInfo(info);
    } catch (err) {
      alert(`切换存储位置失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setStorageBusy(false);
    }
  }, []);

  // 重置为默认存储位置
  const handleResetStorage = useCallback(async () => {
    try {
      setStorageBusy(true);
      await resetStorageDirectory();
      const info = await getStorageInfo();
      setStorageInfo(info);
    } catch (err) {
      alert(`重置存储位置失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setStorageBusy(false);
    }
  }, []);

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
            <div
              className="absolute inset-0 backdrop-blur-sm"
              style={{ backgroundColor: 'rgba(47, 45, 39, 0.4)' }}
              onClick={onClose}
            />

            <motion.div
              className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-claude"
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
                className="flex items-center justify-between px-6 py-4 border-b sticky top-0 z-10"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-color)',
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Logo size={26} className="flex-shrink-0" />
                  <h2
                    className="text-xl font-serif tracking-tight"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    设置
                  </h2>
                </div>
                <button onClick={onClose} className="btn-ghost p-1.5" aria-label="关闭">
                  <XIcon size={18} />
                </button>
              </div>

              <div className="p-6 space-y-7">
                {/* 主题 */}
                <section>
                  <h3 className="claude-eyebrow mb-3" style={{ color: 'var(--text-secondary)' }}>
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
                          className="flex flex-col items-center gap-2 p-3 rounded-lg border transition-all"
                          style={{
                            borderColor: isActive ? 'var(--accent)' : 'var(--border-color)',
                            backgroundColor: isActive ? 'var(--accent-subtle)' : 'transparent',
                          }}
                        >
                          <Icon
                            size={20}
                            style={{
                              color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                            }}
                          />
                          <span
                            className="text-xs font-medium"
                            style={{
                              color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                            }}
                          >
                            {option.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* 专注模式：隐藏侧边栏 / 统计 / 筛选 / Header 图标，仅保留标题与列表 */}
                  <label className="flex items-center justify-between py-2 cursor-pointer">
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      专注模式
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.focusMode}
                      onChange={(e) => onUpdateSettings({ focusMode: e.target.checked })}
                      className="w-4 h-4 accent-[var(--accent)]"
                    />
                  </label>
                </section>

                {/* 通知 */}
                <section>
                  <h3 className="claude-eyebrow mb-3" style={{ color: 'var(--text-secondary)' }}>
                    通知
                  </h3>
                  <label className="flex items-center justify-between py-2 cursor-pointer">
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      启用桌面通知
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.notificationsEnabled}
                      onChange={(e) => onUpdateSettings({ notificationsEnabled: e.target.checked })}
                      className="w-4 h-4 accent-[var(--accent)]"
                    />
                  </label>
                  {settings.notificationsEnabled && (
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                        提前提醒时间
                      </span>
                      <select
                        aria-label="提前提醒时间"
                        value={settings.notificationLeadHours}
                        onChange={(e) =>
                          onUpdateSettings({ notificationLeadHours: Number(e.target.value) })
                        }
                        className="text-sm px-2 py-1 rounded-md border-none"
                        style={{
                          backgroundColor: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                        }}
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
                    <h3 className="claude-eyebrow mb-3" style={{ color: 'var(--text-secondary)' }}>
                      桌面应用
                    </h3>
                    <label className="flex items-center justify-between py-2 cursor-pointer">
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                        开机自启动
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.autoStart}
                        onChange={(e) => onUpdateSettings({ autoStart: e.target.checked })}
                        className="w-4 h-4 accent-[var(--accent)]"
                      />
                    </label>
                    <label className="flex items-center justify-between py-2 cursor-pointer">
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                        关闭时最小化到托盘
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.minimizeToTray}
                        onChange={(e) => onUpdateSettings({ minimizeToTray: e.target.checked })}
                        className="w-4 h-4 accent-[var(--accent)]"
                      />
                    </label>
                    <label className="flex items-center justify-between py-2 cursor-pointer">
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                        启动时自动检查更新
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.autoUpdateEnabled}
                        onChange={(e) => onUpdateSettings({ autoUpdateEnabled: e.target.checked })}
                        className="w-4 h-4 accent-[var(--accent)]"
                      />
                    </label>
                  </section>
                )}

                {/* 数据存储位置（仅桌面端） */}
                {isStorageCustomizable && storageInfo && (
                  <section>
                    <h3 className="claude-eyebrow mb-3" style={{ color: 'var(--text-secondary)' }}>
                      数据存储位置
                    </h3>
                    <div
                      className="flex items-center gap-2 px-3 py-2 rounded-md mb-2 text-xs"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <FolderIcon size={14} className="flex-shrink-0" />
                      <span className="truncate font-mono" title={storageInfo.filePath ?? ''}>
                        {storageInfo.filePath}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={handleChooseStorageDir}
                        disabled={storageBusy}
                        className="flex items-center justify-center gap-1.5 px-2 py-2 text-xs rounded-md transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
                        style={{
                          color: 'var(--text-secondary)',
                          backgroundColor: 'var(--bg-secondary)',
                        }}
                      >
                        <FolderIcon size={14} />
                        更改位置
                      </button>
                      <button
                        onClick={() => void openStorageInFolder()}
                        disabled={storageBusy}
                        className="flex items-center justify-center gap-1.5 px-2 py-2 text-xs rounded-md transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
                        style={{
                          color: 'var(--text-secondary)',
                          backgroundColor: 'var(--bg-secondary)',
                        }}
                      >
                        <FolderIcon size={14} />
                        打开文件夹
                      </button>
                      <button
                        onClick={() => setConfirmResetStorage(true)}
                        disabled={storageBusy}
                        className="flex items-center justify-center gap-1.5 px-2 py-2 text-xs rounded-md transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
                        style={{
                          color: 'var(--text-secondary)',
                          backgroundColor: 'var(--bg-secondary)',
                        }}
                      >
                        <FolderIcon size={14} />
                        重置为默认
                      </button>
                    </div>
                    <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      更改位置时，已有数据会自动迁移到新目录。
                    </p>
                  </section>
                )}

                {/* 数据管理 */}
                <section>
                  <h3 className="claude-eyebrow mb-3" style={{ color: 'var(--text-secondary)' }}>
                    数据管理
                  </h3>
                  <div className="space-y-1.5">
                    <button
                      onClick={onExportAll}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors hover:bg-[var(--bg-hover)]"
                      style={{
                        color: 'var(--text-primary)',
                        backgroundColor: 'var(--bg-secondary)',
                      }}
                    >
                      <DownloadIcon size={15} />
                      导出全部数据 (JSON)
                    </button>
                    <button
                      onClick={onExportCsv}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors hover:bg-[var(--bg-hover)]"
                      style={{
                        color: 'var(--text-primary)',
                        backgroundColor: 'var(--bg-secondary)',
                      }}
                    >
                      <DownloadIcon size={15} />
                      导出当前项目 (CSV)
                    </button>
                    <button
                      onClick={handleImportClick}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors hover:bg-[var(--bg-hover)]"
                      style={{
                        color: 'var(--text-primary)',
                        backgroundColor: 'var(--bg-secondary)',
                      }}
                    >
                      <UploadIcon size={15} />
                      导入数据 (JSON)
                    </button>
                    <button
                      onClick={() => setConfirmReset(true)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors hover:bg-[var(--danger-subtle)]"
                      style={{
                        color: 'var(--danger)',
                        backgroundColor: 'var(--bg-secondary)',
                      }}
                    >
                      <DownloadIcon size={15} className="rotate-180" />
                      重置所有数据
                    </button>
                  </div>
                </section>

                {/* 快捷键说明 */}
                <section>
                  <h3 className="claude-eyebrow mb-3" style={{ color: 'var(--text-secondary)' }}>
                    键盘快捷键
                  </h3>
                  <div className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {[
                      ['Ctrl + N', '新建事项'],
                      ['Ctrl + F', '搜索'],
                      ['Ctrl + S', '保存'],
                      ['Ctrl + B', '切换侧边栏'],
                      ['Ctrl + D', '切换主题'],
                      ['Ctrl + P', '切换专注模式'],
                      ['Ctrl + 1/2/3', '切换筛选视图'],
                      ['Esc', '取消编辑'],
                    ].map(([key, desc]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span>{desc}</span>
                        <kbd
                          className="px-2 py-0.5 rounded font-mono text-[11px]"
                          style={{
                            backgroundColor: 'var(--bg-secondary)',
                            color: 'var(--text-tertiary)',
                            border: '1px solid var(--border-color)',
                          }}
                        >
                          {key}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 关于 */}
                <section>
                  <h3 className="claude-eyebrow mb-3" style={{ color: 'var(--text-secondary)' }}>
                    关于
                  </h3>
                  <div className="flex items-center gap-3">
                    <Logo size={40} className="flex-shrink-0" />
                    <div className="flex flex-col">
                      <span
                        className="text-sm font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Celery Todo
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        版本 {APP_VERSION || '—'}
                      </span>
                    </div>
                  </div>
                  {/* 自动升级（仅桌面端） */}
                  {window.electronAPI?.updaterCheck && (
                    <div className="mt-3">
                      <button
                        onClick={onCheckUpdates}
                        disabled={
                          updateStatus === 'checking' ||
                          updateStatus === 'downloading' ||
                          updateStatus === 'downloaded'
                        }
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          color:
                            updateStatus === 'downloaded'
                              ? 'var(--success)'
                              : updateStatus === 'available'
                                ? 'var(--accent)'
                                : 'var(--text-primary)',
                          backgroundColor: 'var(--bg-secondary)',
                        }}
                      >
                        {updateStatus === 'checking' ? (
                          <motion.span
                            className="inline-flex"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            style={{ display: 'inline-flex' }}
                          >
                            <DownloadIcon size={15} />
                          </motion.span>
                        ) : updateStatus === 'downloaded' ? (
                          <CheckIcon size={15} />
                        ) : (
                          <DownloadIcon size={15} />
                        )}
                        {updateStatus === 'checking'
                          ? '正在检查…'
                          : updateStatus === 'downloading'
                            ? '下载中…'
                            : updateStatus === 'downloaded'
                              ? '更新已就绪'
                              : '检查更新'}
                      </button>
                      {(() => {
                        if (updateStatus === 'available' && updateInfo) {
                          return (
                            <motion.div
                              key="available"
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="mt-2 flex items-start gap-2 px-2.5 py-2 rounded-md"
                              style={{
                                backgroundColor: 'var(--accent-subtle)',
                                border: '1px solid var(--accent)',
                              }}
                            >
                              <motion.div
                                animate={{ scale: [1, 1.15, 1] }}
                                transition={{
                                  duration: 1.6,
                                  repeat: Infinity,
                                  ease: 'easeInOut',
                                }}
                                style={{ flexShrink: 0, color: 'var(--accent)' }}
                              >
                                <AlertIcon size={14} />
                              </motion.div>
                              <div className="flex-1 min-w-0">
                                <p
                                  className="text-xs font-medium"
                                  style={{ color: 'var(--accent-pressed)' }}
                                >
                                  发现新版本 v{updateInfo.version}
                                </p>
                                <p
                                  className="text-xs mt-0.5"
                                  style={{ color: 'var(--text-secondary)' }}
                                >
                                  点击下方按钮下载。
                                </p>
                                <button
                                  onClick={onDownloadUpdate}
                                  className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md transition-colors hover:opacity-90"
                                  style={{
                                    backgroundColor: 'var(--accent)',
                                    color: '#fff',
                                  }}
                                >
                                  <DownloadIcon size={15} />
                                  下载并安装
                                </button>
                              </div>
                            </motion.div>
                          );
                        }
                        if (updateStatus === 'downloading' && updateProgress) {
                          const pct = Math.round(updateProgress.percent);
                          return (
                            <motion.div
                              key="downloading"
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="mt-2"
                            >
                              <div
                                className="flex justify-between text-xs"
                                style={{ color: 'var(--accent)' }}
                              >
                                <span className="flex items-center gap-1.5">
                                  <motion.span
                                    className="inline-block rounded-full"
                                    style={{
                                      width: 6,
                                      height: 6,
                                      backgroundColor: 'var(--accent)',
                                    }}
                                    animate={{ opacity: [0.3, 1, 0.3] }}
                                    transition={{
                                      duration: 1.2,
                                      repeat: Infinity,
                                      ease: 'easeInOut',
                                    }}
                                  />
                                  下载中…
                                </span>
                                <span className="font-mono">{pct}%</span>
                              </div>
                              <div
                                className="mt-1 h-1.5 rounded-full overflow-hidden"
                                style={{ backgroundColor: 'var(--bg-secondary)' }}
                              >
                                <motion.div
                                  className="h-full rounded-full"
                                  style={{ backgroundColor: 'var(--accent)' }}
                                  initial={false}
                                  animate={{ width: `${pct}%` }}
                                  transition={{ duration: 0.3, ease: 'easeOut' }}
                                />
                              </div>
                            </motion.div>
                          );
                        }
                        if (updateStatus === 'downloaded') {
                          return (
                            <motion.div
                              key="downloaded"
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="mt-2 flex items-center gap-2 px-2.5 py-2 rounded-md"
                              style={{
                                backgroundColor: 'var(--accent-subtle)',
                                border: '1px solid var(--success)',
                              }}
                            >
                              <motion.span
                                style={{ color: 'var(--success)', flexShrink: 0 }}
                                initial={{ scale: 0 }}
                                animate={{ scale: [0, 1.2, 1] }}
                                transition={{ duration: 0.4, ease: 'easeOut' }}
                              >
                                <CheckIcon size={14} />
                              </motion.span>
                              <p
                                className="text-xs"
                                style={{ color: 'var(--success)', fontWeight: 500 }}
                              >
                                更新已下载，关闭对话框后将自动提示重启安装。
                              </p>
                            </motion.div>
                          );
                        }
                        if (updateStatus === 'not-available') {
                          return (
                            <motion.div
                              key="not-available"
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="mt-2 flex items-center gap-2 px-2.5 py-2 rounded-md"
                              style={{
                                backgroundColor: 'var(--accent-subtle)',
                                border: '1px solid var(--success)',
                              }}
                            >
                              <motion.span
                                style={{ color: 'var(--success)', flexShrink: 0 }}
                                initial={{ scale: 0 }}
                                animate={{ scale: [0, 1.2, 1] }}
                                transition={{ duration: 0.4, ease: 'easeOut' }}
                              >
                                <CheckIcon size={14} />
                              </motion.span>
                              <p
                                className="text-xs"
                                style={{ color: 'var(--success)', fontWeight: 500 }}
                              >
                                已是最新版本
                              </p>
                            </motion.div>
                          );
                        }
                        if (updateStatus === 'error') {
                          return (
                            <motion.div
                              key="error"
                              initial={{ opacity: 0, x: -4 }}
                              animate={{ opacity: 1, x: [0, -3, 3, -2, 2, 0] }}
                              transition={{ duration: 0.4, ease: 'easeOut' }}
                              className="mt-2 flex items-start gap-2 px-2.5 py-2 rounded-md"
                              style={{
                                backgroundColor: 'var(--danger-subtle)',
                                border: '1px solid var(--danger)',
                              }}
                            >
                              <motion.span
                                style={{ color: 'var(--danger)', flexShrink: 0 }}
                                animate={{ opacity: [1, 0.5, 1] }}
                                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                              >
                                <AlertIcon size={14} />
                              </motion.span>
                              <p className="text-xs" style={{ color: 'var(--danger)' }}>
                                检查更新失败：{updateError || '未知错误'}
                              </p>
                            </motion.div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  )}
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

      <ConfirmDialog
        open={confirmResetStorage}
        title="重置存储位置"
        message="数据将被迁移回应用的默认目录。确定继续吗？"
        confirmText="重置位置"
        onConfirm={() => {
          void handleResetStorage();
          setConfirmResetStorage(false);
        }}
        onCancel={() => setConfirmResetStorage(false)}
      />
    </>
  );
}

export const SettingsPanel = memo(SettingsPanelComponent);
