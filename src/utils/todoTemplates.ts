import type { Project, Todo, TodoTemplate } from '../types';
import { addLocalDays, daysBetween } from './planning';
import { generateId } from './helpers';

export function createTemplateFromProject(
  project: Project,
  todos: Todo[],
  name: string,
  includeCompleted = false,
): TodoTemplate {
  if (project.kind === 'inbox') throw new Error('收集箱不能保存为模板');
  const source = todos.filter((todo) => includeCompleted || !todo.completed);
  if (source.length === 0) throw new Error('项目中没有可保存的事项');
  const dated = source.flatMap((todo) => (todo.plannedDate ? [todo.plannedDate] : []));
  const baseDate = dated.sort()[0];
  return {
    schemaVersion: 1,
    id: generateId(),
    name: name.trim(),
    projectName: project.name,
    color: project.color,
    createdAt: new Date().toISOString(),
    items: source.map((todo) => ({
      title: todo.title,
      description: todo.description,
      priority: todo.priority,
      pinned: todo.pinned,
      order: todo.order,
      plannedDayOffset:
        baseDate && todo.plannedDate ? daysBetween(baseDate, todo.plannedDate) : undefined,
    })),
  };
}

export function instantiateTemplate(
  template: TodoTemplate,
  projectName: string,
  startDate?: string,
): { project: Project; todos: Todo[] } {
  const now = new Date().toISOString();
  const project: Project = {
    id: generateId(),
    name: projectName.trim(),
    color: template.color,
    kind: 'user',
    createdAt: now,
    updatedAt: now,
    order: 0,
  };
  const todos = template.items.map((item) => ({
    id: generateId(),
    projectId: project.id,
    title: item.title,
    description: item.description,
    completed: false,
    priority: item.priority,
    plannedDate:
      startDate && item.plannedDayOffset !== undefined
        ? addLocalDays(startDate, item.plannedDayOffset)
        : undefined,
    createdAt: now,
    updatedAt: now,
    order: item.order,
    pinned: item.pinned,
  }));
  return { project, todos };
}
