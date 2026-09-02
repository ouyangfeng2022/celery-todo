/**
 * @file 桌面平台能力出口（Tauri）
 * @description renderer 组件一律 import 本模块，不直接触碰 Tauri API ——
 *              2.x 的 window.electronAPI 耦合点在这里收敛，便于 jsdom 单测
 *              （非 Tauri 环境全部能力退化为 no-op / 浏览器回退）。
 *
 *              能力开关：贴图/托盘/自启/更新/原生导出保存/存储位置迁移
 *              均已点亮（isTauri）；非 Tauri 环境全灭，UI 相应隐藏入口。
 */

import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

/** 是否运行在 Tauri 宿主中（jsdom 单测 / 浏览器为 false）。 */
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** 与 2.x ElectronAPI.platform 同形的平台标识。 */
export type DesktopPlatform = 'win32' | 'darwin' | 'linux';

export function getPlatform(): DesktopPlatform {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (ua.includes('Mac')) return 'darwin';
  if (ua.includes('Windows')) return 'win32';
  return 'linux';
}

/**
 * 平台能力开关。关闭的能力以 no-op 实现，组件按开关隐藏入口。
 * （storageRelocation 在非 Tauri 环境关闭，storageGateway 返回 web 桩）
 */
export const capabilities = {
  /** 多贴图浮窗（简洁模式） */
  stickers: isTauri,
  /** 系统托盘 + 快速添加 */
  tray: isTauri,
  /** 开机自启 */
  autoStart: isTauri,
  /** 应用内自动更新（tauri-plugin-updater，端点在 tauri.conf） */
  updater: isTauri,
  /** 自定义数据目录（storage-config 迁移） */
  storageRelocation: isTauri,
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
 * 返回取消订阅函数（未在 Tauri 环境时为 no-op）。
 */
export function onDataChanged(handler: DataChangedHandler): () => void {
  dataChangedHandlers.add(handler);
  void ensureDataChangedSubscription();
  return () => {
    dataChangedHandlers.delete(handler);
  };
}

async function ensureDataChangedSubscription(): Promise<void> {
  if (unsubscribeDataChanged || !isTauri) return;
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
// 托盘
// ============================================

/** 托盘「快速添加事项」：唤起主窗口 + 聚焦输入框。 */
export function onQuickAdd(handler: () => void): (() => void) | undefined {
  if (!isTauri) return undefined;
  let off: (() => void) | undefined;
  void import('@tauri-apps/api/event').then(({ listen }) => {
    void listen('quick-add', () => handler()).then((unlisten) => {
      off = unlisten;
    });
  });
  return () => off?.();
}

// ============================================
// 导出落盘（原生「另存为」+ 真实路径回执）
// ============================================

export interface ExportSavedPayload {
  fileName: string;
  filePath: string;
}

type ExportCompletedHandler = (payload: ExportSavedPayload) => void;
const exportCompletedHandlers = new Set<ExportCompletedHandler>();

/**
 * 原生保存：弹出「另存为」对话框并写文件。
 * 用户取消返回 null（调用方按需回退浏览器下载）；
 * 成功后向 onExportCompleted 订阅者回执真实路径（ExportNotice 展示）。
 */
export async function exportFile(
  fileName: string,
  data: string | Uint8Array,
): Promise<ExportSavedPayload | null> {
  if (!isTauri) return null;
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const path = await invoke<string | null>('export_save_file', {
    defaultName: fileName,
    // Tauri IPC 的 Vec<u8> 走 JSON 数组通道；几 MB 的导出（Excel/图片）可接受
    data: Array.from(bytes),
  });
  if (!path) return null;
  const payload = { fileName, filePath: path };
  for (const handler of exportCompletedHandlers) handler(payload);
  return payload;
}

/** 订阅原生保存完成事件（App 的 ExportNotice 数据源）。 */
export function onExportCompleted(handler: ExportCompletedHandler): (() => void) | undefined {
  exportCompletedHandlers.add(handler);
  return () => {
    exportCompletedHandlers.delete(handler);
  };
}

/** 在系统文件管理器中定位已导出的文件。 */
export function openInFolder(path: string): void {
  if (!isTauri) return;
  void invoke('open_in_folder', { path }).catch(() => {});
}

// ============================================
// 外部链接（默认浏览器打开）
// ============================================

/**
 * 用系统默认浏览器打开外部链接（http/https/mailto/tel 等）。
 * 非 Tauri（jsdom 单测 / 纯浏览器 dev）回退为新标签页。
 */
export function openExternal(url: string): void {
  if (!isTauri) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  // tauri-plugin-opener 的 open_url 命令：链接交给系统默认程序
  void invoke('plugin:opener|open_url', { url }).catch((e) => {
    console.error('打开外部链接失败', e);
  });
}

let externalLinksBound = false;

/**
 * 全局拦截外链点击。默认行为会在当前窗口内导航，把整个应用替换成目标
 * 页面（Markdown 描述里的 url 等）；这里统一改为默认浏览器打开，语义与
 * 2.x 壳主进程 setWindowOpenHandler / will-navigate 一致。主窗与贴图窗
 * 共用同一 bundle，由 main.tsx 调用一次即可覆盖所有窗口。
 */
export function bindExternalLinks(): void {
  if (externalLinksBound || typeof document === 'undefined') return;
  externalLinksBound = true;
  document.addEventListener('click', (e) => {
    // 已由 opener 插件注入脚本处理（target=_blank / Ctrl/Shift 点击）时不重复打开
    if (e.defaultPrevented || e.button !== 0) return;
    const anchor = (e.target as Element | null)?.closest?.('a');
    if (!anchor) return;
    let parsed: URL;
    try {
      parsed = new URL(anchor.href);
    } catch {
      return;
    }
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    const isMailTo = parsed.protocol === 'mailto:' || parsed.protocol === 'tel:';
    // 同源链接（应用内相对路径）保留默认导航；仅拦截外部 http(s)/mailto/tel
    if (isMailTo || (isHttp && parsed.origin !== window.location.origin)) {
      e.preventDefault();
      openExternal(parsed.href);
    }
  });
}

// ============================================
// 开机自启（tauri-plugin-autostart）
// ============================================

export function setAutoStart(enabled: boolean): void {
  if (!isTauri) return;
  void invoke('set_auto_start', { enabled }).catch(() => {});
}

// ============================================
// 网络代理（更新器）
// ============================================

/**
 * 设置页改动网络代理后调用：宿主读 DB 设置并把代理写入 HTTP(S)_PROXY
 * 环境变量（reqwest 只认环境变量、不读系统代理）。无需重启，下次
 * 检查更新即走新代理。
 */
export function applyUpdaterProxy(): void {
  if (!isTauri) return;
  void invoke('apply_updater_proxy').catch((e) => {
    console.error('网络代理设置应用失败', e);
  });
}

/** 2.x 首帧窗口底色 hack；Tauri 窗口底色由 HTML/CSS 同步，无需宿主配合。 */
export function setStartupTheme(_theme: string): void {}

// ============================================
// 多贴图窗口（简洁模式）
// ============================================

/**
 * 新建贴图。`hideMain` 默认 true：「进入简洁模式」各入口语义是贴图作为
 * 主窗口的轻量替代，创建后隐藏主窗口；右键项目「创建贴图」传 false，
 * 贴图作为该项目的附加浮窗，主窗口保持可见。
 */
export function createSticker(projectId: string | undefined, opts?: { hideMain?: boolean }): void {
  if (!isTauri) return;
  void invoke('sticker_create', {
    projectId: projectId ?? null,
    hideMain: opts?.hideMain ?? true,
  }).catch(() => {});
}

export function notifyStickerStyleChanged(): void {
  if (!isTauri) return;
  void invoke('sticker_style_changed').catch(() => {});
}

export function setStickerProject(stickerId: string, projectId: string): void {
  if (!isTauri) return;
  void invoke('sticker_set_project', { id: stickerId, projectId }).catch(() => {});
}

export function duplicateSticker(stickerId: string, projectId: string): void {
  if (!isTauri) return;
  void invoke('sticker_duplicate', { sourceId: stickerId, projectId }).catch(() => {});
}

export function closeSticker(stickerId: string): void {
  if (!isTauri) return;
  void invoke('sticker_close', { id: stickerId }).catch(() => {});
}

export function returnToMain(stickerId: string): void {
  if (!isTauri) return;
  void invoke('sticker_return_main', { id: stickerId }).catch(() => {});
}

/** 主窗口改贴图样式后，Rust 向所有贴图窗口广播本事件。 */
export function onStickerStyleChanged(handler: () => void): (() => void) | undefined {
  if (!isTauri) return undefined;
  let off: (() => void) | undefined;
  void import('@tauri-apps/api/event').then(({ listen }) => {
    void listen('sticker-style-changed', () => handler()).then((unlisten) => {
      off = unlisten;
    });
  });
  return () => off?.();
}
