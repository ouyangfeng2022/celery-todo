/** 跨窗口增量同步的最小实体补丁。 */
import type { DeletedTodo, Todo } from './index';

export interface ProjectSyncSnapshot {
  projectId: string;
  todos: Todo[];
  deletedTodos: DeletedTodo[];
}

export interface DataSyncPatch {
  projectSnapshots: ProjectSyncSnapshot[];
}

/** 主进程下发的同步事件；没有 patch 时接收方必须回退整库重载。 */
export interface DataChangedEvent {
  version: number;
  /** 单写入窗口的发送者收到事件时为 false，仅推进自己的版本游标。 */
  shouldApply: boolean;
  patch?: DataSyncPatch;
}
