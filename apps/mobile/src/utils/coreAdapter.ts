/**
 * @file v3 DTO → @celery/core 2.x 形态的适配。
 * @description core 的统计/模板纯函数入参是 2.x 形态（order / 可选字段），
 *              移动端数据层是 v3 形态（rank / 可空字段），这里做最小映射。
 */

import type { Project, Todo } from '@celery/core';
import type { ArchivedTodoDto, TodoDto } from '@celery/data';

/** 项目在 UI 层的精简形状（见 AppData.ProjectView）。 */
export interface ProjectLike {
  id: string;
  name: string;
  kind: 'user' | 'inbox' | 'weekly';
  color?: string | null;
  rank: number;
}

/** TodoDto / ArchivedTodoDto（字段同构）→ core Todo。 */
export function toCoreTodo(t: TodoDto | ArchivedTodoDto): Todo {
  return {
    id: t.id,
    projectId: t.projectId,
    title: t.title,
    description: t.description ?? undefined,
    completed: t.completed,
    priority: t.priority,
    plannedDate: t.plannedDate ?? undefined,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    completedAt: t.completedAt ?? undefined,
    order: t.rank,
    pinned: t.pinned,
  };
}

/** 项目 → core Project（时间戳仅供类型补全，统计只用 name/order）。 */
export function toCoreProject(p: ProjectLike): Project {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    color: p.color ?? undefined,
    createdAt: '',
    updatedAt: '',
    order: p.rank,
  };
}
