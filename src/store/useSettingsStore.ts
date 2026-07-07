/**
 * @file Settings Store - 应用设置状态管理
 * @description 管理主题、通知、Electron 设置等
 */

import { create } from 'zustand';
import type { AppSettings, ThemeMode } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import * as db from '../utils/database';

interface SettingsState extends AppSettings {
  /** 加载设置 */
  loadSettings: () => void;
  /** 设置主题 */
  setTheme: (theme: ThemeMode) => void;
  /** 设置开机自启 */
  setAutoStart: (enabled: boolean) => void;
  /** 设置最小化到托盘 */
  setMinimizeToTray: (enabled: boolean) => void;
  /** 设置通知开关 */
  setNotificationsEnabled: (enabled: boolean) => void;
  /** 设置通知提前时间 */
  setNotificationLeadHours: (hours: number) => void;
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
    // focusMode 在 settings 表中可能不存在（首次升级的老数据），用 null 判断走默认值
    const storedFocus = db.getSetting('focusMode');
    // autoUpdateEnabled 同上：老数据无该键时走默认 true
    const storedAutoUpdate = db.getSetting('autoUpdateEnabled');
    const settings: AppSettings = {
      theme: (db.getSetting('theme') as ThemeMode) ?? DEFAULT_SETTINGS.theme,
      autoStart: db.getSetting('autoStart') === 'true',
      minimizeToTray: db.getSetting('minimizeToTray') !== 'false',
      notificationsEnabled: db.getSetting('notificationsEnabled') !== 'false',
      notificationLeadHours: Number(
        db.getSetting('notificationLeadHours') ?? DEFAULT_SETTINGS.notificationLeadHours,
      ),
      dataVersion: Number(db.getSetting('dataVersion') ?? DEFAULT_SETTINGS.dataVersion),
      focusMode: storedFocus === null ? DEFAULT_SETTINGS.focusMode : storedFocus === 'true',
      autoUpdateEnabled:
        storedAutoUpdate === null ? DEFAULT_SETTINGS.autoUpdateEnabled : storedAutoUpdate === 'true',
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

  setNotificationsEnabled: (notificationsEnabled) => {
    db.setSetting('notificationsEnabled', String(notificationsEnabled));
    set({ notificationsEnabled });
  },

  setNotificationLeadHours: (notificationLeadHours) => {
    db.setSetting('notificationLeadHours', String(notificationLeadHours));
    set({ notificationLeadHours });
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
  },
}));
