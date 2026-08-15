/**
 * @file Repository 契约
 * @description 3.0 数据层的唯一 TypeScript 接口。桌面（Tauri 命令桥）、
 *              移动（expo-sqlite）与测试（内存）各提供一个实现；
 *              UI / 用例层只依赖这里的接口，不接触 SQL、invoke 或 window.*。
 *
 *              DTO 类型来自 crates/celery-db 的 ts-rs 生成物（src/generated），
 *              Rust 与 TS 的字段、命名、可空语义由生成流程保证一致。
 */

import type {
  ArchivedQuery,
  ArchivedTodoPage,
  BatchTodoPatch,
  MoveTodos,
  NewProject,
  NewTodo,
  ProjectDto,
  ProjectPatch,
  ReorderProjects,
  ReorderTodos,
  SearchQuery,
  SettingsKv,
  TodoCounts,
  TodoDto,
  TodoPage,
  TodoPatch,
  TodoQuery,
} from './generated';

// generated 目录没有桶文件（ts-rs 一类型一文件），这里集中再导出消费方所需的类型。
export type {
  ArchivedQuery,
  ArchivedTodoDto,
  ArchivedTodoPage,
  BatchTodoPatch,
  MoveTodos,
  NewProject,
  NewTodo,
  ProjectDto,
  ProjectPatch,
  ReorderProjects,
  ReorderTodos,
  SearchQuery,
  SettingsKv,
  TodoCounts,
  TodoDto,
  TodoFilter,
  TodoPage,
  TodoPatch,
  TodoPriority,
  TodoQuery,
  TodoSort,
  ProjectKind,
  ReplaceAllPayload,
  ReplaceArchivedTodo,
  ReplaceProject,
  ReplaceTodo,
} from './generated';

/** 仓储层错误：跨端统一用异常表达；kind 供 UI 分类提示。 */
export class RepositoryError extends Error {
  constructor(
    public readonly kind: 'not-found' | 'invalid' | 'db' | 'bad-cursor',
    message: string,
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

/** 事项仓储：分页、搜索、批量写、移动、稀疏排序、归档与恢复。 */
export interface TodoRepository {
  page(query: TodoQuery): Promise<TodoPage>;
  /** 聚合计数（首屏与页脚统计一次拿齐，不逐项计数）。 */
  counts(projectId?: string | null): Promise<TodoCounts>;
  /** 单条读取；不存在返回 null（不抛错）。 */
  get(id: string): Promise<TodoDto | null>;

  create(newTodo: NewTodo): Promise<TodoDto>;
  /** 批量创建：单事务，任一条失败整体回滚。 */
  createBulk(items: NewTodo[]): Promise<number>;

  update(id: string, patch: TodoPatch): Promise<TodoDto>;
  batchUpdate(payload: BatchTodoPatch): Promise<number>;
  move(payload: MoveTodos): Promise<number>;
  reorder(payload: ReorderTodos): Promise<number>;

  /** 删除 = 归档（进历史记录，可恢复）。 */
  archive(ids: string[]): Promise<number>;
  archivedPage(query: ArchivedQuery): Promise<ArchivedTodoPage>;
  /** 原项目已删除时落到 fallbackProjectId；未提供则抛 RepositoryError。 */
  restoreArchived(ids: string[], fallbackProjectId?: string | null): Promise<number>;
  purgeArchived(ids: string[]): Promise<number>;
  purgeAllArchived(): Promise<number>;

  /** 全局搜索（FTS5 / 子串语义由实现决定，契约测试约束命中集）。 */
  search(query: SearchQuery): Promise<TodoPage>;
}

/** 项目仓储：CRUD、收集箱、排序与归档。 */
export interface ProjectRepository {
  list(includeArchived?: boolean): Promise<ProjectDto[]>;
  get(id: string): Promise<ProjectDto | null>;
  create(newProject: NewProject): Promise<ProjectDto>;
  update(id: string, patch: ProjectPatch): Promise<ProjectDto>;
  reorder(payload: ReorderProjects): Promise<number>;
  /** 永久删除：其活跃事项先归档（带项目名快照）。 */
  deletePermanently(id: string): Promise<void>;
  /** 确保全局唯一收集箱存在并返回之。 */
  ensureInbox(): Promise<ProjectDto>;
}

/** 设置仓储：只管主题 / 视图 / 模板 / 每项目排序偏好等应用设置。 */
export interface SettingsRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  setBulk(entries: SettingsKv[]): Promise<void>;
  all(): Promise<SettingsKv[]>;
  byPrefix(prefix: string): Promise<SettingsKv[]>;
  delete(key: string): Promise<void>;
}

/** 一套完整仓储。各端从各自的依赖注入容器取用。 */
export interface Repositories {
  todos: TodoRepository;
  projects: ProjectRepository;
  settings: SettingsRepository;
}

// ============================================
// 变更通知（桌面多窗口 / CLI 写入后的细粒度刷新）
// ============================================

/** 变更范围。粒度先到"域 + 项目"级，后续按需要细化到实体 id 级。 */
export interface RepositoryChangeEvent {
  kind: 'todos' | 'projects' | 'settings';
  /** 涉及的项目 id（settings / todos 域尽量提供；无法判定时为空数组）。 */
  projectIds: string[];
  /** 变更来源标记（如 'cli' / 'sticker' / 'main'），供接收方忽略自发事件。 */
  source?: string;
}

/** 细粒度刷新事件源。返回取消订阅函数。 */
export interface RepositoryChangeFeed {
  subscribe(listener: (event: RepositoryChangeEvent) => void): () => void;
}
