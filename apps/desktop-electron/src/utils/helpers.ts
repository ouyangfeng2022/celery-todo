/**
 * @file 通用工具函数（应用侧）
 * @description 领域纯函数已上移 @celery/core；本文件保留浏览器/Tailwind 工具，
 *              并对已上移的纯函数做兼容再导出，应用内既有 import 无需改动。
 */

import { type ClassValue, clsx } from 'clsx';

export {
  generateId,
  debounce,
  formatRelativeTime,
  formatDateTime,
  getTodayString,
  safeJsonParse,
  hasBulkSeparator,
  splitBulkTitles,
} from '@celery/core';

/**
 * 合并 Tailwind CSS 类名
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/**
 * 下载文件
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType = 'application/json',
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 下载二进制文件（例如 Excel 工作簿）。 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 读取上传的文件内容
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
