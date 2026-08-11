import { describe, expect, it } from 'vitest';
import type { Project, Todo } from '../types';
import {
  createTemplateFromProject,
  currentWeekStart,
  instantiateTemplate,
  instantiateWeeklyPlan,
  isWeeklyProjectForDate,
  weeklyProjectName,
} from '../utils/todoTemplates';

const project: Project = {
  id: 'project-1',
  name: '发布计划',
  kind: 'user',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  order: 0,
};

const todos: Todo[] = [
  {
    id: 'todo-1',
    projectId: project.id,
    title: '准备素材',
    description: '保留描述',
    completed: false,
    priority: 'high',
    plannedDate: '2026-08-12',
    pinned: true,
    order: 1024,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'todo-2',
    projectId: project.id,
    title: '正式发布',
    completed: false,
    priority: 'medium',
    plannedDate: '2026-08-15',
    pinned: false,
    order: 2048,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'todo-3',
    projectId: project.id,
    title: '旧事项',
    completed: true,
    priority: 'low',
    pinned: false,
    order: 3072,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
];

describe('todo templates', () => {
  it('本周待办生成带自动标识的周项目和 8 条正确排期的事项', () => {
    const result = instantiateWeeklyPlan('2026-08-17');

    expect(result.project).toMatchObject({ kind: 'weekly', name: '2026 年第 34 周待办' });
    expect(result.project.id).toMatch(/^weekly-2026-W34-/);
    expect(isWeeklyProjectForDate(result.project, '2026-08-17')).toBe(true);
    expect(result.todos).toHaveLength(8);
    expect(result.todos.every((todo) => todo.projectId === result.project.id)).toBe(true);
    expect(result.todos.slice(0, 7).map((todo) => todo.plannedDate)).toEqual([
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
      '2026-08-23',
    ]);
    expect(result.todos[7]).toMatchObject({ title: '每周复盘', plannedDate: '2026-08-23' });
    expect(new Set(result.todos.map((todo) => todo.id)).size).toBe(8);
    expect(result.todos.every((todo) => !todo.completed)).toBe(true);
  });

  it('自定义模板默认排除已完成事项并按最早日期保存相对偏移', () => {
    const template = createTemplateFromProject(project, todos, '发布模板');

    expect(template.items.map((item) => item.title)).toEqual(['准备素材', '正式发布']);
    expect(template.items.map((item) => item.plannedDayOffset)).toEqual([0, 3]);
    expect(template.items[0]).toMatchObject({
      description: '保留描述',
      priority: 'high',
      pinned: true,
      order: 1024,
    });

    const instance = instantiateTemplate(template, '九月发布', '2026-09-01');
    expect(instance.todos.map((todo) => todo.plannedDate)).toEqual(['2026-09-01', '2026-09-04']);
  });

  it('可选择捕获已完成事项，但实例化时统一重置为未完成', () => {
    const template = createTemplateFromProject(project, todos, '完整模板', true);
    const instance = instantiateTemplate(template, '新项目', '2026-09-01');

    expect(template.items).toHaveLength(3);
    expect(instance.todos.every((todo) => todo.completed === false)).toBe(true);
  });

  it('拒绝从收集箱保存模板，并正确生成 ISO 周项目名', () => {
    expect(() =>
      createTemplateFromProject({ ...project, kind: 'inbox', name: '收集箱' }, todos, '模板'),
    ).toThrow('收集箱不能保存为模板');
    expect(weeklyProjectName('2026-08-17')).toBe('2026 年第 34 周待办');
    expect(currentWeekStart(new Date(2026, 7, 19, 12))).toBe('2026-08-17');
  });
});
