/**
 * @file useTheme - 主题切换 Hook
 * @description 支持 light / dark / system 三种模式，自动监听系统主题变化
 */

import { useCallback, useEffect } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';
import type { ThemeMode } from '../types';

/** 应用主题到 document */
function applyTheme(theme: ThemeMode): void {
  const root = document.documentElement;
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const isDark = theme === 'dark' || (theme === 'system' && mediaQuery.matches);

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function useTheme() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  // 应用主题
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // 监听系统主题变化（仅在 system 模式下生效）
  useEffect(() => {
    if (theme !== 'system') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);

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
