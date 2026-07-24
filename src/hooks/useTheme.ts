/**
 * @file useTheme - 主题切换 Hook
 * @description 支持 light / dark / system 三种模式，自动监听系统主题变化
 */

import { useCallback, useEffect } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';
import type { ThemeMode } from '../types';

/**
 * 标题栏 overlay 颜色（与 globals.css 的 CSS 变量对齐）。
 * 完整模式对齐 T 型品牌框架 --bg-frame；
 * 专注模式没有顶部栏，因此对齐正文画布 --bg-primary。
 */
const OVERLAY_COLORS = {
  full: {
    light: { color: '#eed9ce', symbolColor: '#141413' }, // --bg-frame / --text-primary
    dark: { color: '#33251f', symbolColor: '#f3f1ec' },
  },
  focus: {
    light: { color: '#faf9f5', symbolColor: '#141413' }, // --bg-primary / --text-primary
    dark: { color: '#1a1916', symbolColor: '#f3f1ec' },
  },
} as const;

/** 应用主题到 document */
function applyTheme(theme: ThemeMode, focusMode: boolean): void {
  const root = document.documentElement;
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const isDark = theme === 'dark' || (theme === 'system' && mediaQuery.matches);

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // 同步 Electron 标题栏 overlay 颜色（仅 Win/Linux 生效，Web 环境下为 noop）
  const palette = focusMode ? OVERLAY_COLORS.focus : OVERLAY_COLORS.full;
  window.electronAPI?.setTitleBarOverlay?.(isDark ? palette.dark : palette.light);
}

export function useTheme() {
  const theme = useSettingsStore((s) => s.theme);
  const focusMode = useSettingsStore((s) => s.focusMode);
  const setTheme = useSettingsStore((s) => s.setTheme);

  // 应用主题（theme 或 focusMode 任一变化都重算 overlay 颜色）
  useEffect(() => {
    applyTheme(theme, focusMode);
  }, [theme, focusMode]);

  // 监听系统主题变化（仅在 system 模式下生效）
  useEffect(() => {
    if (theme !== 'system') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system', focusMode);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme, focusMode]);

  const toggleTheme = useCallback(() => {
    const root = document.documentElement;
    const isDark = root.classList.contains('dark');
    setTheme(isDark ? 'light' : 'dark');
  }, [setTheme]);

  const cycleTheme = useCallback(() => {
    const order: ThemeMode[] = ['light', 'dark', 'system'];
    const currentIdx = order.indexOf(theme);
    setTheme(order[(currentIdx + 1) % order.length]);
  }, [theme, setTheme]);

  return {
    theme,
    setTheme,
    toggleTheme,
    cycleTheme,
  };
}
