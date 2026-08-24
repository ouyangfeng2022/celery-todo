/**
 * @file 移动端主题
 * @description 消费 @celery/ui-tokens 的语义色板（与桌面端 tokens.css 同源）。
 *              主题选择持久化在本地 settings 表（theme / colorMode 键），
 *              与桌面端字段命名一致，便于未来同一数据库跨端接续。
 */

import { themeCelery, themeDark, themeLight, type ThemeColors } from '@celery/ui-tokens';

export type ThemeName = 'light' | 'dark' | 'celery';

export const THEME_LABELS: Record<ThemeName, string> = {
  light: '纸白',
  dark: '暗色',
  celery: '芹绿',
};

const PALETTES: Record<ThemeName, ThemeColors> = {
  light: themeLight,
  dark: themeDark,
  celery: themeCelery,
};

export function palette(name: ThemeName): ThemeColors {
  return PALETTES[name];
}

/** 优先级标记色（与 @celery/core PRIORITY_SOLID 一致的实色）。 */
export const PRIORITY_DOT: Record<'high' | 'medium' | 'low', string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#64748b',
};

export const PRIORITY_LABELS: Record<'high' | 'medium' | 'low', string> = {
  high: '高',
  medium: '中',
  low: '低',
};

/**
 * 项目颜色预设：取自 @celery/ui-tokens 色阶（coral/ink/sand）+ 品牌绿。
 * null = 无颜色（DB 列可空，桌面端模型同义）。
 */
export const PROJECT_COLORS: readonly string[] = [
  '#d97757', // coral 500 品牌主色
  '#a64a2f', // coral 700
  '#788c5d', // 品牌绿（完成动作色）
  '#f59e0b', // 琥珀
  '#667491', // ink 500
  '#736e60', // sand 600
];
