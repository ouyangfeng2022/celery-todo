/**
 * @file textarea - 多行输入框自适应高度工具
 * @description 统一项目内所有 textarea 的高度策略：按内容自适应，
 *              超过最大高度后由 textarea 自身滚动条承接，避免溢出被截断看不到。
 */

/** 统一最大高度（8 行，对应 leading-6 的 1.5rem × 8）。 */
export const TEXTAREA_MAX_HEIGHT = '12rem';

/**
 * 把 textarea 高度重置为内容真实所需高度。
 * 配合 CSS 上的 maxHeight + overflow-y-auto 使用：内容少时贴合行数，
 * 内容多时被 maxHeight 钳住，超出部分改为内部滚动。
 *
 * 必须先把 height 置 'auto' 再读 scrollHeight，否则 scrollHeight 不会重新计算。
 */
export function autosizeTextarea(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}
