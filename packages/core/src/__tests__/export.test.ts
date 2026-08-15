/**
 * @file 导入导出工具单元测试
 */

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { createTodosExcel, todosToCsv, exportProjectAsJson, parseImportData } from '../export';
import type { Todo, Project, DeletedTodo } from '../entities';

const mockTodo: Todo = {
  id: '1',
  title: '测试事项',
  description: '这是一个测试',
  completed: false,
  priority: 'high',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  projectId: 'p1',
  order: 1,
  pinned: false,
  plannedDate: '2024-01-03',
};

const mockProject: Project = {
  id: 'p1',
  name: '测试项目',
  kind: 'user',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  order: 0,
};

describe('export utils', () => {
  describe('todosToCsv', () => {
    it('应生成包含 BOM 的 CSV', () => {
      const csv = todosToCsv([mockTodo]);
      expect(csv.startsWith('\ufeff')).toBe(true);
      expect(csv).toContain('标题,描述,已完成,优先级,计划日期,创建时间,完成时间,置顶');
      expect(csv).toContain('2024-01-03');
      expect(csv).toContain('测试事项');
      expect(csv).toContain('高');
    });

    it('应在 CSV 行末输出置顶列（是/否）', () => {
      const pinnedTodo: Todo = { ...mockTodo, pinned: true };
      const csv = todosToCsv([pinnedTodo]);
      // 末列应为「是」
      const lines = csv.split('\n');
      expect(lines[1].endsWith('是')).toBe(true);
    });

    it('应正确转义包含逗号的字段', () => {
      const todoWithComma: Todo = { ...mockTodo, title: '包含,逗号的事项' };
      const csv = todosToCsv([todoWithComma]);
      expect(csv).toContain('"包含,逗号的事项"');
    });
  });

  describe('createTodosExcel', () => {
    it('为每个项目创建独立工作表，并保留中文列名', async () => {
      const content = await createTodosExcel([
        { projectName: '工作', todos: [mockTodo] },
        { projectName: '生活', todos: [{ ...mockTodo, id: '2', title: '买菜' }] },
      ]);
      const workbook = XLSX.read(content, { type: 'array' });

      expect(workbook.SheetNames).toEqual(['工作', '生活']);
      const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets['工作'], { header: 1 });
      expect(rows[0]).toEqual([
        '标题',
        '描述',
        '已完成',
        '优先级',
        '计划日期',
        '创建时间',
        '完成时间',
        '置顶',
      ]);
      expect(rows[1][0]).toBe('测试事项');
    });

    it('会规范化重复或不合法的工作表名', async () => {
      const content = await createTodosExcel([
        { projectName: '计划/清单', todos: [] },
        { projectName: '计划:清单', todos: [] },
      ]);
      const workbook = XLSX.read(content, { type: 'array' });

      expect(workbook.SheetNames).toEqual(['计划 清单', '计划 清单 (2)']);
    });
  });

  describe('exportProjectAsJson', () => {
    it('应生成有效的 JSON', () => {
      const json = exportProjectAsJson(mockProject, [mockTodo], []);
      const data = JSON.parse(json);
      expect(data.version).toBe(6);
      expect(data.project.id).toBe('p1');
      expect(data.todos).toHaveLength(1);
      expect(data.todos[0].plannedDate).toBe('2024-01-03');
    });
  });

  describe('parseImportData', () => {
    it('应正确解析项目数据', () => {
      const json = exportProjectAsJson(mockProject, [mockTodo], [] as DeletedTodo[]);
      const data = parseImportData(json);
      expect('project' in data).toBe(true);
    });

    it('应在无效格式时抛出错误', () => {
      expect(() => parseImportData('{"invalid": true}')).toThrow();
    });

    it('应兼容 v3，并且不把历史 dueDate 解释为计划日期', () => {
      const imported = parseImportData(
        JSON.stringify({
          version: 3,
          exportedAt: '2024-01-01T00:00:00.000Z',
          project: { ...mockProject, kind: undefined },
          todos: [{ ...mockTodo, plannedDate: undefined, dueDate: '2024-01-09' }],
          deletedTodos: [],
        }),
      );
      expect('project' in imported && imported.project.kind).toBe('user');
      expect('project' in imported && imported.todos[0].plannedDate).toBeUndefined();
    });

    it('完整备份只保留一个收集箱，并补齐自定义模板默认值', () => {
      const imported = parseImportData(
        JSON.stringify({
          version: 4,
          exportedAt: '2024-01-01T00:00:00.000Z',
          projects: [
            { ...mockProject, id: 'inbox-1', kind: 'inbox' },
            { ...mockProject, id: 'inbox-2', kind: 'inbox' },
          ],
          todos: [],
          deletedTodos: [],
          settings: {},
        }),
      );
      expect('projects' in imported && imported.projects.map((project) => project.kind)).toEqual([
        'inbox',
        'user',
      ]);
      expect('projects' in imported && imported.settings.customTemplates).toEqual([]);
      expect('projects' in imported && imported.settings.showWeeklyProjects).toBe(true);
    });

    it('完整备份保留旧版本周项目类型', () => {
      const imported = parseImportData(
        JSON.stringify({
          version: 4,
          exportedAt: '2026-08-11T00:00:00.000Z',
          projects: [{ ...mockProject, id: 'weekly-2026-W33-id', kind: 'weekly' }],
          todos: [],
          deletedTodos: [],
          settings: {},
        }),
      );

      expect('projects' in imported && imported.projects[0].kind).toBe('weekly');
    });
  });
});
