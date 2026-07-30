/**
 * @file useTheme - 主题切换 Hook
 * @description 支持默认、经典、芹绿三组浅/深色主题及跟随系统模式。
 */

import { useCallback, useEffect } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';
import type { ThemeMode, ThemeName } from '../types';
import celeryLogoUrl from '../../assets/celery-todo-no-text.svg';
import lightLogoUrl from '../../assets/celery-todo-no-text-light.svg';

/**
 * 标题栏 overlay 颜色（与 globals.css 的 CSS 变量对齐）。
 * 完整模式对齐 T 型品牌框架 --bg-frame；
 * 专注模式没有顶部栏，因此对齐正文画布 --bg-primary。
 * light（默认浅色）为中性纸白 --bg-frame rgb(249,249,247)；
 * 每组配色都拥有独立的浅色与深色标题栏颜色。
 */
const OVERLAY_COLORS = {
  full: {
    'default-light': { color: '#f9f9f7', symbolColor: '#141413' }, // rgb(249,249,247) / --text-primary
    'default-dark': { color: '#33251f', symbolColor: '#f3f1ec' },
    'paper-light': { color: '#e3dacc', symbolColor: '#141413' },
    'paper-dark': { color: '#3d3028', symbolColor: '#f6eee8' },
    'celery-light': { color: '#eef3ea', symbolColor: '#263126' },
    'celery-dark': { color: '#263226', symbolColor: '#edf4e9' },
  },
  focus: {
    'default-light': { color: '#f9f9f7', symbolColor: '#141413' }, // --bg-primary / --text-primary
    'default-dark': { color: '#1a1916', symbolColor: '#f3f1ec' },
    'paper-light': { color: '#faf9f5', symbolColor: '#141413' },
    'paper-dark': { color: '#211b18', symbolColor: '#f6eee8' },
    'celery-light': { color: '#f9fbf7', symbolColor: '#263126' },
    'celery-dark': { color: '#182018', symbolColor: '#edf4e9' },
  },
} as const;

/** 应用主题到 document */
type ThemeVariant = Exclude<keyof (typeof OVERLAY_COLORS)['full'], never>;

function applyTheme(theme: ThemeName, colorMode: ThemeMode, focusMode: boolean): void {
  const root = document.documentElement;
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  const isCelery = theme === 'celery';
  if (favicon) favicon.href = isCelery ? celeryLogoUrl : lightLogoUrl;

  const isDark = colorMode === 'dark' || (colorMode === 'system' && mediaQuery.matches);
  root.classList.toggle('theme-paper', theme === 'paper');
  root.classList.toggle('theme-celery', isCelery);

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // 同步 Electron 标题栏 overlay 颜色（仅 Win/Linux 生效，Web 环境下为 noop）
  const palette = focusMode ? OVERLAY_COLORS.focus : OVERLAY_COLORS.full;
  const paletteKey: ThemeVariant = `${theme}-${isDark ? 'dark' : 'light'}`;
  window.electronAPI?.setTitleBarOverlay?.(palette[paletteKey]);
}

export function useTheme() {
  const theme = useSettingsStore((s) => s.theme);
  const colorMode = useSettingsStore((s) => s.colorMode);
  const focusMode = useSettingsStore((s) => s.focusMode);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setColorMode = useSettingsStore((s) => s.setColorMode);

  // 应用主题（theme 或 focusMode 任一变化都重算 overlay 颜色）
  useEffect(() => {
    applyTheme(theme, colorMode, focusMode);
  }, [theme, colorMode, focusMode]);

  // 监听系统主题变化（仅在 system 模式下生效）
  useEffect(() => {
    if (colorMode !== 'system') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme(theme, 'system', focusMode);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme, colorMode, focusMode]);

  const toggleTheme = useCallback(() => {
    const root = document.documentElement;
    const isDark = root.classList.contains('dark');
    setColorMode(isDark ? 'light' : 'dark');
  }, [setColorMode]);

  const cycleTheme = useCallback(() => {
    const order: ThemeMode[] = ['light', 'dark', 'system'];
    const currentIdx = order.indexOf(colorMode);
    setColorMode(order[(currentIdx + 1) % order.length]);
  }, [colorMode, setColorMode]);

  return {
    theme,
    colorMode,
    setTheme,
    setColorMode,
    toggleTheme,
    cycleTheme,
  };
}
