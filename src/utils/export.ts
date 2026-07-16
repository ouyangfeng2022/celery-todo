/**
 * @file 导入导出工具
 * @description 支持 JSON 和 CSV 格式的数据导入导出
 */

import type { Todo, ProjectExportData, AppExportData } from '../types';

/**
 * 导出文件格式版本（独立于 DB schema 版本）。
 *
 * 语义说明：
 * - 当且仅当导出/导入文件的结构发生变化（增删字段、改变序列化形态）时递增。
 * - 与 {@link ../utils/database.ts} 中的 DB_VERSION 相互独立：
 *   后者描述 SQLite 表结构，由 settings.dataVersion 持久化；
 *   本常量只描述磁盘上 JSON 文件的兼容性。
 * - 详见仓库根目录 VERSIONING.md。
 */
export const EXPORT_FORMAT_VERSION = 3;

/**
 * 将 Todo 转换为 CSV 行
 */
function todoToCsvRow(todo: Todo): string {
  const escapeCsv = (value: string | undefined): string => {
    if (value === undefined || value === null) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  return [
    escapeCsv(todo.title),
    escapeCsv(todo.description),
    todo.completed ? '是' : '否',
    todo.priority === 'high' ? '高' : todo.priority === 'medium' ? '中' : '低',
    escapeCsv(todo.createdAt),
    escapeCsv(todo.completedAt),
    todo.pinned ? '是' : '否',
  ].join(',');
}

/**
 * 导出 Todo 列表为 CSV 字符串
 */
export function todosToCsv(todos: Todo[]): string {
  const header = '标题,描述,已完成,优先级,创建时间,完成时间,置顶';
  const rows = todos.map(todoToCsvRow);
  // 添加 BOM 以支持 Excel 正确识别 UTF-8
  return '\ufeff' + [header, ...rows].join('\n');
}

/**
 * 导出单个项目数据为 JSON
 */
export function exportProjectAsJson(
  project: import('../types').Project,
  todos: Todo[],
  deletedTodos: import('../types').DeletedTodo[],
): string {
  const data: ProjectExportData = {
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    project,
    todos,
    deletedTodos,
  };
  return JSON.stringify(data, null, 2);
}

/**
 * 导出完整应用数据为 JSON
 */
export function exportAppAsJson(data: AppExportData): string {
  return JSON.stringify(data, null, 2);
}

/**
 * 解析导入的 JSON 数据
 */
export function parseImportData(jsonString: string): ProjectExportData | AppExportData {
  const data = JSON.parse(jsonString);
  if (!data.version || !data.exportedAt) {
    throw new Error('无效的数据格式：缺少必要字段');
  }
  // 判断是单个项目还是完整应用数据
  if ('project' in data && 'todos' in data) {
    return data as ProjectExportData;
  }
  if ('projects' in data) {
    return data as AppExportData;
  }
  throw new Error('无效的数据格式：无法识别数据结构');
}
