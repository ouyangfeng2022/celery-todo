/**
 * @file 通用工具函数
 */

import { type ClassValue, clsx } from 'clsx';

/**
 * 合并 Tailwind CSS 类名
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/**
 * 生成唯一 ID
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Debounce 函数
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * 格式化为相对时间（用于过去时间：创建/删除等）
 *
 * 规则：分钟为最小单位；超过 1 小时才改用小时为单位；超过 24 小时退回绝对日期。
 */
export function formatRelativeTime(isoString?: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = Date.now();
  const diffSec = Math.floor((now - date.getTime()) / 1000);

  // 未来时间或不足 1 分钟，统一显示“刚刚”
  if (diffSec < 60) return '刚刚';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分钟前`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * 获取今天的日期字符串（YYYY-MM-DD）
 */
export function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * 安全的 JSON 解析
 */
export function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
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

// ============================================
// 批量添加：分隔符处理
// ============================================

/**
 * 批量分隔符正则：仅按换行（兼容 \r\n / \r / \n）。
 * 逗号、分号视为普通字符，允许在标题中使用。
 */
const BULK_SEPARATOR_REGEX = /\r\n|\r|\n/;

/**
 * 判断输入文本是否包含批量分隔符（换行）。
 * 用于在 UI 上切换"批量添加"标签，以及决定走单条/批量路径。
 */
export function hasBulkSeparator(text: string): boolean {
  return BULK_SEPARATOR_REGEX.test(text);
}

/**
 * 把多行文本拆分为去空白、去空行的标题数组。
 */
export function splitBulkTitles(rawText: string): string[] {
  return rawText
    .split(BULK_SEPARATOR_REGEX)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}
