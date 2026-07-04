/**
 * @file 类型定义 - Todo List 应用的核心类型系统
 * @description 定义所有数据模型、状态、操作的 TypeScript 类型
 */

// ============================================
// 优先级
// ============================================

/** 事项优先级 */
export type Priority = 'high' | 'medium' | 'low';

/** 优先级标签映射 */
export const PRIORITY_LABELS: Record<Priority, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

/** 优先级颜色（Tailwind 类名） */
export const PRIORITY_COLORS: Record<Priority, string> = {
  high: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  medium: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  low: 'bg-sand-100 text-sand-600 dark:bg-sand-800/60 dark:text-sand-300',
};

// ============================================
// 筛选与排序
// ============================================

/** 筛选视图类型 */
export type FilterType = 'all' | 'active' | 'completed';

/** 排序方式 */
export type SortType = 'created-asc' | 'created-desc' | 'due-date' | 'priority' | 'manual';

/** 排序选项标签 */
export const SORT_LABELS: Record<SortType, string> = {
  'created-asc': '创建时间 ↑',
  'created-desc': '创建时间 ↓',
  'due-date': '截止日期',
  priority: '优先级',
  manual: '手动排序',
};

// ============================================
// 主题
// ============================================

/** 主题模式 */
export type ThemeMode = 'light' | 'dark' | 'system';

// ============================================
// Todo 事项
// ============================================

/** Todo 事项数据模型 */
export interface Todo {
  /** 唯一标识符 */
  id: string;
  /** 所属项目 ID */
  projectId: string;
  /** 事项标题 */
  title: string;
  /** 事项描述（支持 Markdown） */
  description?: string;
  /** 是否已完成 */
  completed: boolean;
  /** 优先级 */
  priority: Priority;
  /** 截止日期（ISO 字符串） */
  dueDate?: string;
  /** 创建时间（ISO 字符串） */
  createdAt: string;
  /** 更新时间（ISO 字符串） */
  updatedAt: string;
  /** 完成时间（ISO 字符串） */
  completedAt?: string;
  /** 手动排序的顺序值 */
  order: number;
}

/** 回收站中的已删除事项 */
export interface DeletedTodo extends Todo {
  /** 删除时间（ISO 字符串） */
  deletedAt: string;
  /** 预计永久删除时间（ISO 字符串，30 天后） */
  expiresAt: string;
}

// ============================================
// 项目
// ============================================

/** 项目数据模型 */
export interface Project {
  /** 唯一标识符 */
  id: string;
  /** 项目名称 */
  name: string;
  /** 项目颜色（用于侧边栏标识） */
  color?: string;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

// ============================================
// 设置
// ============================================

/** 应用设置 */
export interface AppSettings {
  /** 主题模式 */
  theme: ThemeMode;
  /** 是否开机自启（Electron） */
  autoStart: boolean;
  /** 是否最小化到托盘 */
  minimizeToTray: boolean;
  /** 是否启用桌面通知 */
  notificationsEnabled: boolean;
  /** 通知提前时间（小时） */
  notificationLeadHours: number;
  /** 数据版本号（用于迁移） */
  dataVersion: number;
  /** 是否处于专注模式（隐藏侧边栏 / 统计 / 筛选 / 添加框 / Header 图标） */
  focusMode: boolean;
}

/** 默认设置 */
export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  autoStart: false,
  minimizeToTray: true,
  notificationsEnabled: true,
  notificationLeadHours: 24,
  dataVersion: 1,
  // 默认启动即进入专注模式
  focusMode: true,
};

// ============================================
// 导入/导出
// ============================================

/** 导出的项目数据（含其所有 Todo） */
export interface ProjectExportData {
  /** 数据格式版本 */
  version: number;
  /** 导出时间 */
  exportedAt: string;
  /** 项目信息 */
  project: Project;
  /** 该项目的所有 Todo */
  todos: Todo[];
  /** 该项目的回收站事项 */
  deletedTodos: DeletedTodo[];
}

/** 完整应用数据导出 */
export interface AppExportData {
  version: number;
  exportedAt: string;
  projects: Project[];
  todos: Todo[];
  deletedTodos: DeletedTodo[];
  settings: AppSettings;
}

// ============================================
// 通知
// ============================================

/** 应用内通知 */
export interface AppNotification {
  id: string;
  type: 'reminder' | 'info' | 'warning';
  title: string;
  message: string;
  todoId?: string;
  createdAt: string;
  read: boolean;
}

// ============================================
// 批量操作
// ============================================

/** 批量操作类型 */
export type BatchAction = 'complete' | 'uncomplete' | 'delete' | 'setPriority';

/** 批量操作参数 */
export interface BatchOperation {
  action: BatchAction;
  todoIds: string[];
  priority?: Priority;
}
