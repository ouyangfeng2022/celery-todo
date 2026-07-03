/**
 * @file Electron 类型定义
 */

import type { App } from 'electron';

/** App 实例的运行时扩展类型 */
export type AppWithIsQuitting = App & { isQuitting?: boolean };
