/**
 * @file 桌面平台能力出口（Tauri）
 * @description renderer 组件一律 import 本模块，不直接触碰 Tauri API ——
 *              2.x 的 window.electronAPI 耦合点在这里收敛，便于 jsdom 单测与
 *              后续能力（托盘/贴图/自启/更新）逐项点亮。
 *
 *              未点亮的能力以 no-op / undefined 回调实现，组件按 capabilities
 *              开关隐藏入口，避免「点了没反应」。
 */

import { getCurrentWindow } from '@tauri-apps/api/window';

/** 与 2.x ElectronAPI.platform 同形的平台标识。 */
export type DesktopPlatform = 'win32' | 'darwin' | 'linux';

export function getPlatform(): DesktopPlatform {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (ua.includes('Mac')) return 'darwin';
  if (ua.includes('Windows')) return 'win32';
  return 'linux';
}

/**
 * 平台能力开关。3.0 UI 迁移分阶段点亮：
 * - stickers/tray/autoStart/updater/storageRelocation：阶段 B（平台能力里程碑）
 * 组件据此隐藏对应入口；开关全部打开后即与 2.x 功能对齐。
 */
export const capabilities = {
  /** 多贴图浮窗（简洁模式） */
  stickers: false,
  /** 系统托盘 + 快速添加 */
  tray: false,
  /** 开机自启 */
  autoStart: false,
  /** 应用内自动更新 */
  updater: false,
  /** 自定义数据目录（storage-config 迁移） */
  storageRelocation: false,
} as const;

// ============================================
// 窗口控制（自绘标题栏，decorations: false）
// ============================================

export function closeWindow(): void {
  void getCurrentWindow().close();
}

export function minimizeWindow(): void {
  void getCurrentWindow().minimize();
}

export function toggleMaximizeWindow(): void {
  void getCurrentWindow().toggleMaximize();
}

// ============================================
// 数据变更广播（Rust 写命令后 emit，所有窗口收到）
// ============================================

/** 与 src-tauri commands.rs 的 DataChangedEvent 同构。 */
export interface DataChangedEvent {
  revision: number;
  /** 发起方窗口 label（后续含 "cli"） */
  source: string;
  todosChanged: boolean;
  projectIds: string[];
  projectsChanged: boolean;
  settingsChanged: boolean;
  archiveChanged: boolean;
  fullRefresh: boolean;
}

export type DataChangedHandler = (event: DataChangedEvent) => void;

let unsubscribeDataChanged: (() => void) | null = null;
const dataChangedHandlers = new Set<DataChangedHandler>();

/**
 * 订阅数据变更；自发事件（source === 本窗口 label）已被过滤。
 * 返回取消订阅函数（未在 Tauri 环境时返回 no-op）。
 */
export function onDataChanged(handler: DataChangedHandler): () => void {
  dataChangedHandlers.add(handler);
  void ensureDataChangedSubscription();
  return () => {
    dataChangedHandlers.delete(handler);
  };
}

async function ensureDataChangedSubscription(): Promise<void> {
  if (unsubscribeDataChanged) return;
  try {
    const { listen } = await import('@tauri-apps/api/event');
    const ownLabel = getCurrentWindow().label;
    unsubscribeDataChanged = await listen<DataChangedEvent>('data-changed', (event) => {
      if (event.payload.source === ownLabel) return;
      for (const handler of dataChangedHandlers) handler(event.payload);
    });
  } catch {
    // 非 Tauri 环境（jsdom 单测）：订阅静默失败，handlers 不会被触发
  }
}

// ============================================
// 托盘 / 贴图 / 自启 / 更新（阶段 B 点亮，先以 no-op 占位）
// ============================================

export function onQuickAdd(_handler: () => void): (() => void) | undefined {
  // 阶段 B：托盘「快速添加事项」菜单项事件
  return undefined;
}

export function onExportCompleted(
  _handler: (payload: { fileName: string; filePath: string }) => void,
): (() => void) | undefined {
  // 阶段 B：原生保存对话框写盘完成后的真实路径回传
  return undefined;
}

export function openInFolder(_path: string): void {
  // 阶段 B：plugin-opener reveal
}

export function setAutoStart(_enabled: boolean): void {
  // 阶段 B：tauri-plugin-autostart
}

export function setStartupTheme(_theme: string): void {
  // 2.x 首帧窗口底色 hack；Tauri 窗口底色由 HTML/CSS 同步，无需主进程配合。
}

export function createSticker(_projectId: string | undefined): void {
  // 阶段 B：多贴图窗口（WebviewWindow + 持久化 bounds）
}

export function notifyStickerStyleChanged(): void {
  // 阶段 B：贴图样式设置变更后广播
}

export function setStickerProject(_stickerId: string, _projectId: string): void {
  // 阶段 B：持久化贴图窗口绑定的项目
}

export function duplicateSticker(_stickerId: string, _projectId: string): void {
  // 阶段 B
}

export function closeSticker(_stickerId: string): void {
  // 阶段 B
}

export function returnToMain(_stickerId: string): void {
  // 阶段 B：显示主窗口并关闭贴图
}

export function onStickerStyleChanged(_handler: () => void): (() => void) | undefined {
  // 阶段 B：主窗口样式变更广播
  return undefined;
}
