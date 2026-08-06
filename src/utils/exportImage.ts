/**
 * @file DOM 节点 → PNG 图片导出工具
 * @description 基于 html-to-image（SVG foreignObject 方案），把渲染好的 React 节点
 *   截成高清 PNG。用于「导出项目为图片」功能。
 *
 * 设计要点：
 * - pixelRatio: 2 —— Retina/高分屏清晰；导出尺寸适中（720px 宽 → 1440px 物理像素）
 * - cacheBust: true —— 避免 CDN 字体/图片缓存导致 foreignObject 二次请求拿到脏数据
 * - backgroundColor: 透明 —— 卡片自带背景，外层留透明可适配任意嵌入底色
 * - 截图前 await document.fonts.ready —— 确保自定义字体（Poppins/Lora/Tinos）已加载，
 *   否则 foreignObject 内的文本会 fallback 到系统字体
 */

import { toPng } from 'html-to-image';

/** 导出选项（对外暴露的最小集） */
export interface ExportImageOptions {
  /** 物理像素 / CSS 像素比，默认 2（高清） */
  pixelRatio?: number;
}

/** 默认截图参数 */
const DEFAULTS = {
  pixelRatio: 2,
  cacheBust: true,
  // 留空字符串 = 透明背景（html-to-image 的约定）
  backgroundColor: '',
} as const;

/**
 * 把 DOM 节点导出为 PNG Blob。
 * 用于「下载 PNG」（Blob → URL → <a download>）和「复制到剪贴板」（ClipboardItem）。
 */
export async function exportNodeAsPngBlob(
  node: HTMLElement,
  options: ExportImageOptions = {},
): Promise<Blob> {
  // 字体未就绪时截图会 fallback 到系统字体
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* 字体加载失败不阻塞截图，走 fallback */
    }
  }

  const dataUrl = await toPng(node, { ...DEFAULTS, pixelRatio: options.pixelRatio ?? 2 });
  const res = await fetch(dataUrl);
  return res.blob();
}

/**
 * 把 DOM 节点导出为 PNG dataURL（仅在需要直接喂给 <img> 预览时使用）。
 * 下载场景优先用 {@link exportNodeAsPngBlob}，避免巨型 base64 字符串占用内存。
 */
export async function exportNodeAsPngDataURL(
  node: HTMLElement,
  options: ExportImageOptions = {},
): Promise<string> {
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
  }
  return toPng(node, { ...DEFAULTS, pixelRatio: options.pixelRatio ?? 2 });
}
