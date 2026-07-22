/**
 * @file Settings Store - 应用设置状态管理
 * @description 管理主题、Electron 设置、自动更新等
 */

import { create } from 'zustand';
import type { AppSettings, ThemeMode } from '../types';
import { DEFAULT_SETTINGS, type StickerPreset } from '../types';
import * as db from '../utils/database';

/** 贴图样式相关字段名集合 —— 用于 updateSettings 时判断是否需要广播给贴图窗口 */
const STICKER_SETTING_KEYS: ReadonlySet<string> = new Set([
  'stickerPreset',
  'stickerRadius',
  'stickerBlur',
  'stickerOpacity',
  'stickerShadow',
]);

interface SettingsState extends AppSettings {
  /** 加载设置 */
  loadSettings: () => void;
  /** 设置主题 */
  setTheme: (theme: ThemeMode) => void;
  /** 设置开机自启 */
  setAutoStart: (enabled: boolean) => void;
  /** 设置最小化到托盘 */
  setMinimizeToTray: (enabled: boolean) => void;
  /** 设置专注模式开关 */
  setFocusMode: (enabled: boolean) => void;
  /** 设置自动检查更新开关 */
  setAutoUpdateEnabled: (enabled: boolean) => void;
  /** 更新多个设置 */
  updateSettings: (updates: Partial<AppSettings>) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,

  loadSettings: () => {
    // 专注模式已废弃：升级时清理旧键，始终进入完整主窗口。
    db.deleteSetting('focusMode');
    // autoUpdateEnabled 同上：老数据无该键时走默认 true
    const storedAutoUpdate = db.getSetting('autoUpdateEnabled');
    const settings: AppSettings = {
      theme: (db.getSetting('theme') as ThemeMode) ?? DEFAULT_SETTINGS.theme,
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
      // ===== 贴图样式（老数据缺失键时整套回退到玻璃预设的默认值） =====
      stickerPreset:
        (db.getSetting('stickerPreset') as StickerPreset | null) ?? DEFAULT_SETTINGS.stickerPreset,
      stickerRadius: Number(db.getSetting('stickerRadius') ?? DEFAULT_SETTINGS.stickerRadius),
      stickerBlur: Number(db.getSetting('stickerBlur') ?? DEFAULT_SETTINGS.stickerBlur),
      stickerOpacity: Number(db.getSetting('stickerOpacity') ?? DEFAULT_SETTINGS.stickerOpacity),
      stickerShadow: db.getSetting('stickerShadow') !== 'false',
    };
    set(settings);
  },

  setTheme: (theme) => {
    db.setSetting('theme', theme);
    set({ theme });
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

  updateSettings: (updates) => {
    const current = get();
    const newSettings = { ...current, ...updates };
    Object.entries(updates).forEach(([key, value]) => {
      db.setSetting(key, String(value));
    });
    set(newSettings);
    // 贴图样式相关字段被改动时，通知主进程向所有已打开的贴图窗口广播刷新。
    // 贴图是独立 renderer 进程，不共享 React 状态，必须经 IPC 同步。
    const touchesSticker = Object.keys(updates).some((key) => STICKER_SETTING_KEYS.has(key));
    if (touchesSticker) {
      window.electronAPI?.notifyStickerStyleChanged?.();
    }
  },
}));
