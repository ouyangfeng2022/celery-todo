/**
 * @file Settings Store - 应用设置状态管理
 * @description 管理主题、Electron 设置、自动更新等
 */

import { create } from 'zustand';
import type { AppSettings, ThemeMode, ThemeName } from '../types';
import { DEFAULT_SETTINGS, type StickerPreset } from '../types';
import * as db from '../utils/database';

type StartupTheme = `${ThemeName}-${ThemeMode}`;
const toStartupTheme = (theme: ThemeName, colorMode: ThemeMode): StartupTheme =>
  `${theme}-${colorMode}`;

/** 贴图样式相关字段名集合 —— 用于 updateSettings 时判断是否需要广播给贴图窗口 */
const STICKER_SETTING_KEYS: ReadonlySet<string> = new Set([
  'stickerPreset',
  'stickerRadius',
  'stickerBlur',
  'stickerOpacity',
  'stickerShadow',
]);

/** 将旧版「主题 + 明暗」合并值迁移为两个独立设置。 */
function normalizeTheme(
  value: string | null,
  colorMode: string | null,
): Pick<AppSettings, 'theme' | 'colorMode'> {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return { theme: 'default', colorMode: value };
  }
  if (value === 'paper' || value === 'paper-light') return { theme: 'paper', colorMode: 'light' };
  if (value === 'paper-dark') return { theme: 'paper', colorMode: 'dark' };
  if (value === 'celery' || value === 'celery-light')
    return { theme: 'celery', colorMode: 'light' };
  if (value === 'celery-dark') return { theme: 'celery', colorMode: 'dark' };
  return {
    theme:
      value === 'default' || value === 'paper' || value === 'celery'
        ? value
        : DEFAULT_SETTINGS.theme,
    colorMode:
      colorMode === 'light' || colorMode === 'dark' || colorMode === 'system'
        ? colorMode
        : DEFAULT_SETTINGS.colorMode,
  };
}

interface SettingsState extends AppSettings {
  /** 加载设置 */
  loadSettings: (options?: { syncStartupTheme?: boolean }) => void;
  /** 设置主题 */
  setTheme: (theme: ThemeName) => void;
  /** 设置主题明暗模式 */
  setColorMode: (colorMode: ThemeMode) => void;
  /** 设置开机自启 */
  setAutoStart: (enabled: boolean) => void;
  /** 设置最小化到托盘 */
  setMinimizeToTray: (enabled: boolean) => void;
  /** 设置专注模式开关 */
  setFocusMode: (enabled: boolean) => void;
  /** 设置自动检查更新开关 */
  setAutoUpdateEnabled: (enabled: boolean) => void;
  /** 设置时间显示格式（relative=模糊 / exact=精确到分钟） */
  setTimeFormat: (format: 'relative' | 'exact') => void;
  /** 更新多个设置 */
  updateSettings: (updates: Partial<AppSettings>) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,

  loadSettings: ({ syncStartupTheme = true } = {}) => {
    // 专注模式已废弃：升级时清理旧键，始终进入完整主窗口。
    // 仅当该 key 仍存在时才执行删除 —— deleteSetting 内部走 execute() →
    // scheduleSave()，会在 500ms 后触发 persistDatabase 并向其它窗口广播
    // data:changed。若每次加载都无条件删除，贴图窗口（每个 reload / refresh
    // 都会调 loadSettings）会把"自己内存库的旧快照"写盘，覆盖主窗口尚未落盘
    // 的 addTodo，表现为「主窗口创建待办闪现约 1 秒后消失」。幂等删除让该写
    // 只在真正需要时发生一次。
    if (db.getSetting('focusMode') !== null) {
      db.deleteSetting('focusMode');
    }
    // autoUpdateEnabled 同上：老数据无该键时走默认 true
    const storedAutoUpdate = db.getSetting('autoUpdateEnabled');
    const storedTheme = db.getSetting('theme');
    const normalizedTheme = normalizeTheme(storedTheme, db.getSetting('colorMode'));
    if (storedTheme !== normalizedTheme.theme) db.setSetting('theme', normalizedTheme.theme);
    if (db.getSetting('colorMode') !== normalizedTheme.colorMode) {
      db.setSetting('colorMode', normalizedTheme.colorMode);
    }
    const settings: AppSettings = {
      ...normalizedTheme,
      autoStart: db.getSetting('autoStart') === 'true',
      minimizeToTray: db.getSetting('minimizeToTray') !== 'false',
      dataVersion: Number(db.getSetting('dataVersion') ?? DEFAULT_SETTINGS.dataVersion),
      focusMode: false,
      autoUpdateEnabled:
        storedAutoUpdate === null
          ? DEFAULT_SETTINGS.autoUpdateEnabled
          : storedAutoUpdate === 'true',
      // lastActiveProjectId：字符串型，缺失键优雅回退空串（首次启动 / 老数据）
      lastActiveProjectId:
        db.getSetting('lastActiveProjectId') ?? DEFAULT_SETTINGS.lastActiveProjectId,
      // timeFormat：老数据无该键时默认相对时间
      timeFormat:
        db.getSetting('timeFormat') === 'exact' ? 'exact' : DEFAULT_SETTINGS.timeFormat,
      // ===== 贴图样式（老数据缺失键时整套回退到玻璃预设的默认值） =====
      stickerPreset:
        (db.getSetting('stickerPreset') as StickerPreset | null) ?? DEFAULT_SETTINGS.stickerPreset,
      stickerRadius: Number(db.getSetting('stickerRadius') ?? DEFAULT_SETTINGS.stickerRadius),
      stickerBlur: Number(db.getSetting('stickerBlur') ?? DEFAULT_SETTINGS.stickerBlur),
      stickerOpacity: Number(db.getSetting('stickerOpacity') ?? DEFAULT_SETTINGS.stickerOpacity),
      stickerShadow: db.getSetting('stickerShadow') !== 'false',
    };
    set(settings);
    // 仅完整主窗口可以持久化启动主题。贴图 renderer 也会复用本 store 加载视觉设置，
    // 但没有调用该系统级 IPC 的权限，必须显式跳过。
    if (syncStartupTheme) {
      window.electronAPI?.setStartupTheme?.(toStartupTheme(settings.theme, settings.colorMode));
    }
  },

  setTheme: (theme) => {
    db.setSetting('theme', theme);
    set({ theme });
    window.electronAPI?.setStartupTheme?.(toStartupTheme(theme, get().colorMode));
  },

  setColorMode: (colorMode) => {
    db.setSetting('colorMode', colorMode);
    set({ colorMode });
    window.electronAPI?.setStartupTheme?.(toStartupTheme(get().theme, colorMode));
  },

  setAutoStart: (autoStart) => {
    db.setSetting('autoStart', String(autoStart));
    set({ autoStart });
    // 通知 Electron 主进程
    if (window.electronAPI?.setAutoStart) {
      window.electronAPI.setAutoStart(autoStart);
    }
  },

  setMinimizeToTray: (minimizeToTray) => {
    db.setSetting('minimizeToTray', String(minimizeToTray));
    set({ minimizeToTray });
  },

  setFocusMode: (focusMode) => {
    db.setSetting('focusMode', String(focusMode));
    set({ focusMode });
  },

  setAutoUpdateEnabled: (autoUpdateEnabled) => {
    db.setSetting('autoUpdateEnabled', String(autoUpdateEnabled));
    set({ autoUpdateEnabled });
  },

  setTimeFormat: (timeFormat) => {
    db.setSetting('timeFormat', timeFormat);
    set({ timeFormat });
  },

  updateSettings: (updates) => {
    const current = get();
    const newSettings = { ...current, ...updates };
    Object.entries(updates).forEach(([key, value]) => {
      db.setSetting(key, String(value));
    });
    set(newSettings);
    if (updates.theme || updates.colorMode) {
      window.electronAPI?.setStartupTheme?.(
        toStartupTheme(newSettings.theme, newSettings.colorMode),
      );
    }
    // 贴图样式相关字段被改动时，通知主进程向所有已打开的贴图窗口广播刷新。
    // 贴图是独立 renderer 进程，不共享 React 状态，必须经 IPC 同步。
    const touchesSticker = Object.keys(updates).some((key) => STICKER_SETTING_KEYS.has(key));
    if (touchesSticker) {
      window.electronAPI?.notifyStickerStyleChanged?.();
    }
  },
}));
