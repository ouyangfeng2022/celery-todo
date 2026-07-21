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

/** 优先级颜色（Tailwind 类名）：浅底 + 彩色字，用于列表 tag 主体 */
export const PRIORITY_COLORS: Record<Priority, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300',
};

/** 优先级实色（用于左侧色条、圆点、分段控件选中态等需要饱和色的位置） */
export const PRIORITY_SOLID: Record<Priority, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#64748b',
};

// ============================================
// 筛选与排序
// ============================================

/** 筛选视图类型 */
export type FilterType = 'all' | 'active' | 'completed';

/** 排序方式 */
export type SortType = 'created-asc' | 'created-desc' | 'priority' | 'manual';

/** 排序选项标签 */
export const SORT_LABELS: Record<SortType, string> = {
  'created-asc': '创建时间 ↑',
  'created-desc': '创建时间 ↓',
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
  /** 创建时间（ISO 字符串） */
  createdAt: string;
  /** 更新时间（ISO 字符串） */
  updatedAt: string;
  /** 完成时间（ISO 字符串） */
  completedAt?: string;
  /** 手动排序的顺序值 */
  order: number;
  /** 是否置顶（置顶项始终浮在列表最前） */
  pinned: boolean;
}

/** 已归档事项（历史记录；删除 todo 后归档保留，仅在历史记录页手动删除） */
export interface DeletedTodo extends Todo {
  /** 归档时间（ISO 字符串） */
  deletedAt: string;
  /** @deprecated 原回收站 30 天自动清除的过期时间；归档模式下已废弃，不再用于自动清除。保留以兼容旧数据/导入导出 */
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
  /** 手动排序的顺序值（侧边栏拖拽排序） */
  order: number;
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
  /** 数据版本号（用于迁移） */
  dataVersion: number;
  /** 是否处于专注模式（隐藏侧边栏 / 统计 / 筛选 / 添加框 / Header 图标） */
  focusMode: boolean;
  /** 是否在启动时自动检查更新（仅桌面端生效） */
  autoUpdateEnabled: boolean;
  /** 上次激活的项目 ID（启动时恢复；空串表示无激活项目） */
  lastActiveProjectId: string;
}

/** 默认设置 */
export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  autoStart: false,
  minimizeToTray: true,
  dataVersion: 1,
  // 旧版专注模式保留兼容读取；新安装默认完整界面
  focusMode: false,
  // 默认启用自动检查更新
  autoUpdateEnabled: true,
  // 首次启动无历史激活项目，空串 → 显示「请创建项目」
  lastActiveProjectId: '',
};

// ============================================
// 导入/导出
// ============================================

/** 导出的项目数据（含其所有 Todo） */
export interface ProjectExportData {
  /** 导出文件格式版本（见 utils/export.ts 的 EXPORT_FORMAT_VERSION） */
  version: number;
  /** 导出时间 */
  exportedAt: string;
  /** 项目信息 */
  project: Project;
  /** 该项目的所有 Todo */
  todos: Todo[];
  /** 该项目的归档事项（历史记录） */
  deletedTodos: DeletedTodo[];
}

/** 完整应用数据导出 */
export interface AppExportData {
  /** 导出文件格式版本（见 utils/export.ts 的 EXPORT_FORMAT_VERSION） */
  version: number;
  exportedAt: string;
  projects: Project[];
  todos: Todo[];
  deletedTodos: DeletedTodo[];
  settings: AppSettings;
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
