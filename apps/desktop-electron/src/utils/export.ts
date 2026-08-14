/**
 * @file 导入导出工具
 * @description 支持 JSON、CSV 和 Excel 格式的数据导入导出
 */

import {
  DEFAULT_SETTINGS,
  type Todo,
  type Project,
  type ProjectExportData,
  type AppExportData,
  type HistoryExportData,
} from '../types';

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
export const EXPORT_FORMAT_VERSION = 6;

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
    escapeCsv(todo.plannedDate),
    escapeCsv(todo.createdAt),
    escapeCsv(todo.completedAt),
    todo.pinned ? '是' : '否',
  ].join(',');
}

/**
 * 导出 Todo 列表为 CSV 字符串
 */
export function todosToCsv(todos: Todo[]): string {
  const header = '标题,描述,已完成,优先级,计划日期,创建时间,完成时间,置顶';
  const rows = todos.map(todoToCsvRow);
  // 添加 BOM 以支持 Excel 正确识别 UTF-8
  return '\ufeff' + [header, ...rows].join('\n');
}

const EXCEL_COLUMNS = [
  ['title', '标题'],
  ['description', '描述'],
  ['completed', '已完成'],
  ['priority', '优先级'],
  ['plannedDate', '计划日期'],
  ['createdAt', '创建时间'],
  ['completedAt', '完成时间'],
  ['pinned', '置顶'],
] as const;

function todoToExcelRow(todo: Todo): Record<(typeof EXCEL_COLUMNS)[number][1], string> {
  return {
    标题: todo.title,
    描述: todo.description ?? '',
    已完成: todo.completed ? '是' : '否',
    优先级: todo.priority === 'high' ? '高' : todo.priority === 'medium' ? '中' : '低',
    计划日期: todo.plannedDate ?? '',
    创建时间: todo.createdAt,
    完成时间: todo.completedAt ?? '',
    置顶: todo.pinned ? '是' : '否',
  };
}

/** Excel 工作表名不能含特定字符且最多 31 个字符。 */
function getSafeSheetName(name: string, usedNames: Set<string>): string {
  const base = (name.replace(/[\\/:?*\u005B\u005D]/g, ' ') || '未命名项目').slice(0, 31);
  let candidate = base;
  let index = 2;
  while (usedNames.has(candidate)) {
    const suffix = ` (${index++})`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  usedNames.add(candidate);
  return candidate;
}

/**
 * 创建 Excel 工作簿。全量导出时每个项目对应一个工作表。
 */
export async function createTodosExcel(
  projectTodos: Array<{ projectName: string; todos: Todo[] }>,
): Promise<ArrayBuffer> {
  // 延迟加载，避免未使用导出功能时把 Excel 库放进首屏包。
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  const headers = EXCEL_COLUMNS.map(([, label]) => label);

  for (const { projectName, todos } of projectTodos) {
    const sheet = XLSX.utils.json_to_sheet(todos.map(todoToExcelRow), { header: headers });
    sheet['!cols'] = [
      { wch: 28 },
      { wch: 42 },
      { wch: 10 },
      { wch: 14 },
      { wch: 10 },
      { wch: 24 },
      { wch: 24 },
      { wch: 8 },
    ];
    XLSX.utils.book_append_sheet(workbook, sheet, getSafeSheetName(projectName, usedNames));
  }

  // 至少保留一个工作表，兼容项目列表为空的边界情况。
  if (workbook.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers]), '项目');
  }
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
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
 * 导出历史记录（归档）为 JSON。
 *
 * 这是**单向只读快照**，刻意不进入 parseImportData 的识别分支
 * （字段名错开为 archivedTodos / projectNames，并带 kind 标记），
 * 仅供备份与人工查阅，不可被现有 importer 导回。
 */
export function exportHistoryAsJson(data: HistoryExportData): string {
  return JSON.stringify(data, null, 2);
}

/**
 * 解析导入的 JSON 数据
 */
export function parseImportData(jsonString: string): ProjectExportData | AppExportData {
  const data: unknown = JSON.parse(jsonString);
  if (!data || typeof data !== 'object') throw new Error('无效的数据格式：无法识别数据结构');
  const raw = data as Record<string, unknown>;
  if (!raw.version || !raw.exportedAt) {
    throw new Error('无效的数据格式：缺少必要字段');
  }
  const normalizeTodo = <T extends Todo>(todo: T): T => ({
    ...todo,
    plannedDate: typeof todo.plannedDate === 'string' ? todo.plannedDate : undefined,
  });
  const normalizeProject = (project: Project, kind: Project['kind'] = 'user'): Project => ({
    ...project,
    kind,
  });
  // 判断是单个项目还是完整应用数据
  if ('project' in raw && 'todos' in raw) {
    const imported = raw as unknown as ProjectExportData;
    return {
      ...imported,
      project: normalizeProject(imported.project, imported.project.kind ?? 'user'),
      todos: imported.todos.map(normalizeTodo),
      deletedTodos: (imported.deletedTodos ?? []).map(normalizeTodo),
    };
  }
  if ('projects' in raw) {
    const imported = raw as unknown as AppExportData;
    let hasInbox = false;
    const projects = imported.projects.map((project) => {
      const kind =
        project.kind === 'inbox' && !hasInbox
          ? 'inbox'
          : project.kind === 'weekly'
            ? 'weekly'
            : 'user';
      if (kind === 'inbox') hasInbox = true;
      return normalizeProject(project, kind);
    });
    return {
      ...imported,
      projects,
      todos: (imported.todos ?? []).map(normalizeTodo),
      deletedTodos: (imported.deletedTodos ?? []).map(normalizeTodo),
      settings: {
        ...DEFAULT_SETTINGS,
        ...(imported.settings ?? {}),
        customTemplates: imported.settings?.customTemplates ?? [],
      },
    };
  }
  throw new Error('无效的数据格式：无法识别数据结构');
}
