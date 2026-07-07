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
 * 格式化日期为可读字符串
 *
 * 以日历天为单位比较，避免直接用毫秒差：
 * 例如刚创建的 todo（createdAt 比 now 早几毫秒），毫秒差为负的小数，
 * Math.floor 会得到 -1 从而误显示“昨天”。
 */
export function formatDate(isoString?: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const diffDays = Math.round(
    (startOfDay(date) - startOfDay(now)) / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '明天';
  if (diffDays === -1) return '昨天';
  if (diffDays > 0 && diffDays < 7) return `${diffDays} 天后`;
  if (diffDays < 0 && diffDays > -7) return `${Math.abs(diffDays)} 天前`;

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * 格式化为相对时间（用于过去时间：创建/通知/删除等）
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
 * 格式化日期时间
 */
export function formatDateTime(isoString?: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 获取今天的日期字符串（YYYY-MM-DD）
 */
export function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * 检查日期是否已过期
 */
export function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  const now = new Date();
  // 截止日期按整天计算（包含当天则不算过期）
  due.setHours(23, 59, 59, 999);
  return due.getTime() < now.getTime();
}

/**
 * 检查是否在 24 小时内到期
 */
export function isDueSoon(dueDate?: string, hours = 24): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  return diffMs > 0 && diffMs < hours * 60 * 60 * 1000;
}

/**
 * 计算剩余天数
 */
export function daysUntil(dueDate?: string): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
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
