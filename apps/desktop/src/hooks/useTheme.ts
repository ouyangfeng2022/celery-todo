/**
 * @file useTheme - 主题切换 Hook
 * @description 支持默认、经典、芹绿三组浅/深色主题及跟随系统模式。
 *              3.0 Tauri 版：标题栏自绘（decorations: false），底色由
 *              HTML/CSS 决定，无需宿主同步；favicon 随主题换色（见下）。
 *              托盘/任务栏图标固定品牌橙，不随主题换色（2.x 的
 *              set-app-icon 行为不移植 —— 品牌主色统一为橙）。
 */

import { useCallback, useEffect } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';
import type { ThemeMode, ThemeName } from '../types';
import celeryLogoUrl from '../../assets/celery-todo-no-text.svg';
import lightLogoUrl from '../../assets/celery-todo-no-text-light.svg';

/** 应用主题到 document */
function applyTheme(theme: ThemeName, colorMode: ThemeMode): void {
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
}

export function useTheme() {
  const theme = useSettingsStore((s) => s.theme);
  const colorMode = useSettingsStore((s) => s.colorMode);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setColorMode = useSettingsStore((s) => s.setColorMode);

  useEffect(() => {
    applyTheme(theme, colorMode);
  }, [theme, colorMode]);

  // 监听系统主题变化（仅在 system 模式下生效）
  useEffect(() => {
    if (colorMode !== 'system') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme(theme, 'system');
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme, colorMode]);

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
