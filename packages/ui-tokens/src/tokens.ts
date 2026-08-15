/**
 * @file Celery Todo 3.0 设计 token（唯一源）
 * @description 从 2.x 桌面端的视觉语言提取：coral 主色（品牌橙）+ 暖沙中性色 +
 *              芹绿点缀（仅「芹绿」主题）、Poppins/Lora 字体栈、4px 间距基准。
 *              桌面端（Tailwind）与移动端（RN StyleSheet）从这里取值，
 *              各端不各自发明颜色/尺寸。
 *
 * 语义化颜色（bg/text/accent/danger…）按「主题」分组：light（纸白/经典）、
 * dark、celery（芹绿）。主题切换 = 换一组语义值，不换组件代码。
 */

// ============================================
// 品牌色阶（2.x claude/sand/ink 三条 ramp 原样保留）
// ============================================

export const coral = {
  50: '#faf6f3',
  100: '#f5ebe3',
  200: '#ecd5c5',
  300: '#dfb39a',
  400: '#d4906b',
  500: '#d97757', // 主品牌色
  600: '#c75d3d',
  700: '#a64a2f',
  800: '#843c27',
  900: '#6b3220',
  950: '#3a1a10',
} as const;

export const sand = {
  50: '#faf9f7',
  100: '#f5f4f0',
  200: '#e8e6df',
  300: '#d6d3c8',
  400: '#b8b3a4',
  500: '#948e7e',
  600: '#736e60',
  700: '#5c584c',
  800: '#46433a',
  900: '#2f2d27',
  950: '#1a1916',
} as const;

export const ink = {
  50: '#f6f7f9',
  100: '#eceef2',
  200: '#d5dae3',
  300: '#b0b9ca',
  400: '#8593ac',
  500: '#667491',
  600: '#515d77',
  700: '#434c61',
  800: '#3a4151',
  900: '#343945',
  950: '#22252e',
} as const;

/** 功能色（跨主题固定） */
export const status = {
  danger: '#c0392b',
  dangerSubtle: '#fdf2f0',
  success: '#788c5d',
  warning: '#b8860b',
  /** 芹绿点缀 —— 仅「芹绿」主题使用，日常 UI 一律 coral */
  celeryGreen: '#788c5d',
  celeryGreenSubtle: '#edf0e8',
  info: '#6a9bcc',
  infoSubtle: '#e8f0f7',
} as const;

/** 优先级色（与 @celery/core 的 PRIORITY_SOLID 一致） */
export const priority = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#64748b',
} as const;

// ============================================
// 语义化主题（light=经典 / dark / celery=芹绿）
// ============================================

export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgHover: string;
  bgActive: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentHover: string;
  accentPressed: string;
  accentSubtle: string;
  pinnedBg: string;
}

/** 经典（纸白）主题 —— 2.x 默认观感 */
export const themeLight: ThemeColors = {
  bgPrimary: '#f9f9f7',
  bgSecondary: '#f9f9f7',
  bgTertiary: '#ffffff',
  bgHover: 'rgba(0, 0, 0, 0.04)',
  bgActive: 'rgba(0, 0, 0, 0.08)',
  textPrimary: '#141413',
  textSecondary: '#272724',
  textTertiary: '#4a4944',
  border: '#dedcd3',
  borderStrong: '#b0aea5',
  accent: coral[500],
  accentHover: coral[600],
  accentPressed: coral[700],
  accentSubtle: '#f7e8e1',
  pinnedBg: '#f7e3d099',
};

/** 深色主题 —— 沿用 2.x dark 变量骨架，亮度对齐 Material 暗色基准 */
export const themeDark: ThemeColors = {
  bgPrimary: '#1e1e1c',
  bgSecondary: '#232320',
  bgTertiary: '#2a2a27',
  bgHover: 'rgba(255, 255, 255, 0.06)',
  bgActive: 'rgba(255, 255, 255, 0.10)',
  textPrimary: '#f2f1ed',
  textSecondary: '#cfcdc5',
  textTertiary: '#9b988f',
  border: '#3a3934',
  borderStrong: '#55534b',
  accent: coral[400],
  accentHover: coral[300],
  accentPressed: coral[500],
  accentSubtle: '#3d2a21',
  pinnedBg: '#4a332399',
};

/** 芹绿主题 —— 唯一允许使用 celery 绿作为 accent 的主题 */
export const themeCelery: ThemeColors = {
  ...themeLight,
  accent: status.celeryGreen,
  accentHover: '#68794f',
  accentPressed: '#586742',
  accentSubtle: status.celeryGreenSubtle,
  pinnedBg: '#e2e8d599',
};

export const themes = {
  light: themeLight,
  dark: themeDark,
  celery: themeCelery,
} as const;

export type ThemeKey = keyof typeof themes;

// ============================================
// 字体
// ============================================

export const font = {
  /** 标题：Poppins（品牌规范），中文回退 Noto Sans SC */
  heading: "'Poppins', 'Noto Sans SC', Arial, sans-serif",
  /** 正文：Lora（衬线），中文回退 Noto Serif SC */
  body: "'Lora', 'Noto Serif SC', Georgia, serif",
  /** 品牌 logotype */
  brand: "'Tinos', 'Source Serif Pro', Georgia, Cambria, 'Times New Roman', serif",
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
} as const;

/** RN 无衬线回退（系统字体）；移动端正文用系统无衬线，标题保留 Poppins */
export const fontNative = {
  heading: " 'Poppins', 'Noto Sans SC', system, sans-serif".trim(),
  body: "system, 'Noto Sans SC', sans-serif",
} as const;

// ============================================
// 间距 / 圆角 / 阴影 / 动效
// ============================================

/** 4px 基准（0 = 0，1 = 4px …） */
export const space = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64] as const;
export type SpaceToken = (typeof space)[number];

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const shadow = {
  sm: '0 1px 3px 0 rgba(0,0,0,0.04), 0 1px 2px -1px rgba(0,0,0,0.04)',
  md: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.04)',
  lg: '0 10px 15px -3px rgba(0,0,0,0.06), 0 4px 6px -4px rgba(0,0,0,0.04)',
} as const;

/** 动效时长（ms）与缓动 —— 桌面 Framer Motion / 移动 Reanimated 共用 */
export const motion = {
  duration: { fast: 150, base: 200, slow: 320 },
  easing: {
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
    decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
    accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
  },
} as const;
