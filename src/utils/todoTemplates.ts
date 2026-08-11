import type { Project, Todo, TodoTemplate } from '../types';
import { addLocalDays, daysBetween, formatLocalDate, startOfWeekMonday } from './planning';
import { generateId } from './helpers';

const WEEKDAYS = [
  '周一待办',
  '周二待办',
  '周三待办',
  '周四待办',
  '周五待办',
  '周六待办',
  '周日待办',
];

export const WEEKLY_TEMPLATE: TodoTemplate = {
  schemaVersion: 1,
  id: 'builtin-weekly-plan',
  name: '本周待办',
  projectName: '本周待办',
  createdAt: 'builtin',
  items: [
    ...WEEKDAYS.map((title, index) => ({
      title,
      priority: 'medium' as const,
      pinned: false,
      order: (index + 1) * 1024,
      plannedDayOffset: index,
    })),
    {
      title: '每周复盘',
      priority: 'medium',
      pinned: true,
      order: 8 * 1024,
      plannedDayOffset: 6,
    },
  ],
};

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

export function weeklyProjectName(startDate: string): string {
  const { year, week } = isoWeek(startDate);
  return `${year} 年第 ${week} 周待办`;
}

/** 当前日期所属周的周一（本地日历）。 */
export function currentWeekStart(now = new Date()): string {
  return startOfWeekMonday(formatLocalDate(now));
}

/** 自动周项目写入 ID 的稳定周键，用于重命名后仍能识别同一周。 */
export function weeklyProjectKey(startDate: string): string {
  const { year, week } = isoWeek(startDate);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** 判断项目是否是指定周由时间视图自动创建的项目。 */
export function isWeeklyProjectForDate(project: Project, startDate: string): boolean {
  return (
    project.kind === 'weekly' && project.id.startsWith(`weekly-${weeklyProjectKey(startDate)}-`)
  );
}

/** 生成本周专用项目及其八条事项。 */
export function instantiateWeeklyPlan(startDate: string): { project: Project; todos: Todo[] } {
  const instance = instantiateTemplate(WEEKLY_TEMPLATE, weeklyProjectName(startDate), startDate);
  const projectId = `weekly-${weeklyProjectKey(startDate)}-${generateId()}`;
  return {
    ...instance,
    project: {
      ...instance.project,
      id: projectId,
      kind: 'weekly',
    },
    todos: instance.todos.map((todo) => ({
      ...todo,
      projectId,
    })),
  };
}

function isoWeek(startDate: string): { year: number; week: number } {
  const date = new Date(`${startDate}T12:00:00`);
  const firstThursday = new Date(date);
  firstThursday.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const yearStart = new Date(firstThursday.getFullYear(), 0, 4, 12);
  const week = 1 + Math.round((firstThursday.getTime() - yearStart.getTime()) / 604800000);
  return { year: firstThursday.getFullYear(), week };
}

export function nextMondayDate(now = new Date()): string {
  const today = formatLocalDate(now);
  const weekday = now.getDay();
  const offset = weekday === 1 ? 7 : weekday === 0 ? 1 : 8 - weekday;
  return addLocalDays(today, offset);
}
