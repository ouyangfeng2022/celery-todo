/**
 * @file CLI 本地类型定义
 * @description 与 src/types/index.ts 中的数据模型保持一致，但刻意独立维护，
 *              避免 CLI 编译时拉入渲染端的 React/全局类型耦合。
 *              字段同步规则：src/types/index.ts 改动时，此处需同步。
 */

export type Priority = 'high' | 'medium' | 'low';

export interface Todo {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: Priority;
  /** ISO 字符串，可能为空 */
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  /** 对应 DB 的 sort_order */
  order: number;
}

export interface DeletedTodo extends Todo {
  deletedAt: string;
  /** 兼容字段：归档不再自动清除，保留以兼容旧数据 */
  expiresAt: string;
}

export interface Project {
  id: string;
  name: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
  /**
   * 对应 DB 的 sort_order。
   * 插入新项目时可省略（undefined）—— db.insertProject 的 SQL 会用
   * COALESCE(NULL, MAX(sort_order)+1) 自动追加到末尾。
   */
  order?: number;
}

export interface StorageInfo {
  /** 当前数据库文件绝对路径 */
  filePath: string;
  /** 默认数据目录（未自定义时与 filePath 的父目录一致） */
  defaultDir: string;
  /** 是否自定义过存储位置（读自 storage-config.json） */
  customized: boolean;
}

/** 校验优先级字符串，非法时回退 medium */
export function normalizePriority(value: unknown): Priority {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'medium';
}
