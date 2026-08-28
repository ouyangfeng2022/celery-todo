/**
 * @file Settings Store - 应用设置状态管理
 * @description 管理主题、Electron 设置、自动更新等
 */

import { create } from 'zustand';
import type { AppSettings, ThemeMode, ThemeName } from '../types';
import { DEFAULT_SETTINGS, STICKER_PRESET_VALUES, type StickerPreset } from '../types';
import * as data from '../utils/dataGateway';
import {
  notifyStickerStyleChanged,
  setAutoStart as setAutoStartHost,
  setStartupTheme,
} from '../platform';

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
  'stickerShowCompleted',
]);

function parseCustomTemplates(value: string | undefined): AppSettings['customTemplates'] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as AppSettings['customTemplates']) : [];
  } catch {
    return [];
  }
}

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
  loadSettings: (options?: { syncStartupTheme?: boolean }) => Promise<void>;
  /** 设置主题 */
  setTheme: (theme: ThemeName) => Promise<void>;
  /** 设置主题明暗模式 */
  setColorMode: (colorMode: ThemeMode) => Promise<void>;
  /** 设置开机自启 */
  setAutoStart: (enabled: boolean) => Promise<void>;
  /** 设置最小化到托盘 */
  setMinimizeToTray: (enabled: boolean) => Promise<void>;
  /** 设置专注模式开关 */
  setFocusMode: (enabled: boolean) => Promise<void>;
  /** 设置自动检查更新开关 */
  setAutoUpdateEnabled: (enabled: boolean) => Promise<void>;
  /** 设置时间显示格式（relative=模糊 / exact=精确到分钟） */
  setTimeFormat: (format: 'relative' | 'exact') => Promise<void>;
  /** 更新多个设置 */
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,

  loadSettings: async ({ syncStartupTheme = true } = {}) => {
    const stored = await data.getSettings();
    // 专注模式已废弃：升级时清理旧键，始终进入完整主窗口。
    // 仅当该 key 仍存在时才执行删除 —— deleteSetting 内部走 execute() →
    // scheduleSave()，会在 500ms 后触发 persistDatabase 并向其它窗口广播
    // data:changed。若每次加载都无条件删除，贴图窗口（每个 reload / refresh
    // 都会调 loadSettings）会把"自己内存库的旧快照"写盘，覆盖主窗口尚未落盘
    // 的 addTodo，表现为「主窗口创建待办闪现约 1 秒后消失」。幂等删除让该写
    // 只在真正需要时发生一次。
    if (stored.focusMode !== undefined) {
      await data.deleteSetting('focusMode');
    }
    // autoUpdateEnabled 同上：老数据无该键时走默认 true
    const storedAutoUpdate = stored.autoUpdateEnabled ?? null;
    const storedTheme = stored.theme ?? null;
    const normalizedTheme = normalizeTheme(storedTheme, stored.colorMode ?? null);
    if (storedTheme !== normalizedTheme.theme)
      await data.setSetting('theme', normalizedTheme.theme);
    if (stored.colorMode !== normalizedTheme.colorMode) {
      await data.setSetting('colorMode', normalizedTheme.colorMode);
    }
    const settings: AppSettings = {
      ...normalizedTheme,
      autoStart: stored.autoStart === 'true',
      minimizeToTray: stored.minimizeToTray !== 'false',
      // startupWindow：老数据无该键时默认主窗口
      startupWindow:
        stored.startupWindow === 'sticker'
          ? 'sticker'
          : DEFAULT_SETTINGS.startupWindow,
      dataVersion: Number(stored.dataVersion ?? DEFAULT_SETTINGS.dataVersion),
      focusMode: false,
      autoUpdateEnabled:
        storedAutoUpdate === null
          ? DEFAULT_SETTINGS.autoUpdateEnabled
          : storedAutoUpdate === 'true',
      // lastActiveProjectId：字符串型，缺失键优雅回退空串（首次启动 / 老数据）
      lastActiveProjectId: stored.lastActiveProjectId ?? DEFAULT_SETTINGS.lastActiveProjectId,
      customTemplates: parseCustomTemplates(stored.customTemplates),
      todoViewMode: stored.todoViewMode === 'card' ? 'card' : DEFAULT_SETTINGS.todoViewMode,
      // 老数据无该键时保持原有行为：显示自动创建的周项目。
      showWeeklyProjects: stored.showWeeklyProjects !== 'false',
      // timeFormat：老数据无该键时默认相对时间
      timeFormat: stored.timeFormat === 'exact' ? 'exact' : DEFAULT_SETTINGS.timeFormat,
      // ===== 贴图样式（老数据缺失键时整套回退到玻璃预设的默认值） =====
      stickerPreset:
        (stored.stickerPreset as StickerPreset | undefined) ?? DEFAULT_SETTINGS.stickerPreset,
      stickerRadius: Number(stored.stickerRadius ?? DEFAULT_SETTINGS.stickerRadius),
      stickerBlur: Number(stored.stickerBlur ?? DEFAULT_SETTINGS.stickerBlur),
      // stickerOpacity 不再读 DB：当前版本设置面板已移除独立的透明度滑块，
      // 它只能随预设整体变化。直接由当前 preset 派生，避免老 DB 里残留的
      // 旧 opacity 值（如 65）覆盖预设的合理值，导致贴图永久偏淡（issue #12）。
      stickerOpacity:
        STICKER_PRESET_VALUES[
          (stored.stickerPreset as StickerPreset | undefined) ?? DEFAULT_SETTINGS.stickerPreset
        ].opacity,
      stickerShadow: stored.stickerShadow !== 'false',
      // 老数据无该键时保持原有行为：显示已完成事项
      stickerShowCompleted: stored.stickerShowCompleted !== 'false',
    };
    set(settings);
    // 仅完整主窗口可以持久化启动主题。贴图 renderer 也会复用本 store 加载视觉设置，
    // 但没有调用该系统级 IPC 的权限，必须显式跳过。
    if (syncStartupTheme) {
      setStartupTheme(toStartupTheme(settings.theme, settings.colorMode));
    }
  },

  setTheme: async (theme) => {
    await data.setSetting('theme', theme);
    set({ theme });
    setStartupTheme(toStartupTheme(theme, get().colorMode));
  },

  setColorMode: async (colorMode) => {
    await data.setSetting('colorMode', colorMode);
    set({ colorMode });
    setStartupTheme(toStartupTheme(get().theme, colorMode));
  },

  setAutoStart: async (autoStart) => {
    await data.setSetting('autoStart', String(autoStart));
    set({ autoStart });
    // 通知宿主同步 OS 登录项（tauri-plugin-autostart）
    setAutoStartHost(autoStart);
  },

  setMinimizeToTray: async (minimizeToTray) => {
    await data.setSetting('minimizeToTray', String(minimizeToTray));
    set({ minimizeToTray });
  },

  setFocusMode: async (focusMode) => {
    await data.setSetting('focusMode', String(focusMode));
    set({ focusMode });
  },

  setAutoUpdateEnabled: async (autoUpdateEnabled) => {
    await data.setSetting('autoUpdateEnabled', String(autoUpdateEnabled));
    set({ autoUpdateEnabled });
  },

  setTimeFormat: async (timeFormat) => {
    await data.setSetting('timeFormat', timeFormat);
    set({ timeFormat });
  },

  updateSettings: async (updates) => {
    const current = get();
    const newSettings = { ...current, ...updates };
    await Promise.all(
      Object.entries(updates).map(([key, value]) =>
        data.setSetting(key, key === 'customTemplates' ? JSON.stringify(value) : String(value)),
      ),
    );
    set(newSettings);
    if (updates.theme || updates.colorMode) {
      setStartupTheme(toStartupTheme(newSettings.theme, newSettings.colorMode));
    }
    // 贴图样式相关字段被改动时，通知宿主向所有已打开的贴图窗口广播刷新。
    // 贴图是独立 webview，不共享 React 状态，必须经事件同步。
    const touchesSticker = Object.keys(updates).some((key) => STICKER_SETTING_KEYS.has(key));
    if (touchesSticker) {
      notifyStickerStyleChanged();
    }
  },
}));
