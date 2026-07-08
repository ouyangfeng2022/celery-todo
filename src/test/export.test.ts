/**
 * @file 导入导出工具单元测试
 */

import { describe, it, expect } from 'vitest';
import { todosToCsv, exportProjectAsJson, parseImportData } from '../utils/export';
import type { Todo, Project, DeletedTodo } from '../types';

const mockTodo: Todo = {
  id: '1',
  title: '测试事项',
  description: '这是一个测试',
  completed: false,
  priority: 'high',
  dueDate: '2025-01-01T00:00:00.000Z',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  projectId: 'p1',
  order: 1,
};

const mockProject: Project = {
  id: 'p1',
  name: '测试项目',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  order: 0,
};

describe('export utils', () => {
  describe('todosToCsv', () => {
    it('应生成包含 BOM 的 CSV', () => {
      const csv = todosToCsv([mockTodo]);
      expect(csv.startsWith('\ufeff')).toBe(true);
      expect(csv).toContain('标题,描述,已完成,优先级,截止日期,创建时间,完成时间');
      expect(csv).toContain('测试事项');
      expect(csv).toContain('高');
    });

    it('应正确转义包含逗号的字段', () => {
      const todoWithComma: Todo = { ...mockTodo, title: '包含,逗号的事项' };
      const csv = todosToCsv([todoWithComma]);
      expect(csv).toContain('"包含,逗号的事项"');
    });
  });

  describe('exportProjectAsJson', () => {
    it('应生成有效的 JSON', () => {
      const json = exportProjectAsJson(mockProject, [mockTodo], []);
      const data = JSON.parse(json);
      expect(data.version).toBe(1);
      expect(data.project.id).toBe('p1');
      expect(data.todos).toHaveLength(1);
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
  });
});
