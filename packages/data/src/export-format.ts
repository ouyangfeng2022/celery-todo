/**
 * @file v3 导入导出格式
 * @description 3.0 的 JSON 交换文件格式。与 2.x 完全不兼容：
 *              - 顶层有显式 `format: "celery-todo/v3"` 标识；
 *              - 独立的 formatVersion（描述文件结构，与 DB schema 版本无关）；
 *              - 旧版（无 format 字段或值不符）直接判为不支持，不做猜测式迁移。
 */

import type { ArchivedTodoDto, ProjectDto, SettingsKv, TodoDto } from './generated';

export const V3_FORMAT_ID = 'celery-todo/v3' as const;

/** v3 导出文件结构版本：字段/序列化形态变化时递增。 */
export const V3_EXPORT_FORMAT_VERSION = 1;

/** v3 导出文件（完整快照：项目 + 活跃事项 + 归档 + 应用设置）。 */
export interface V3ExportFile {
  format: typeof V3_FORMAT_ID;
  formatVersion: number;
  exportedAt: string;
  /** 产生文件的应用版本（仅作溯源，导入不校验）。 */
  appVersion: string;
  projects: ProjectDto[];
  todos: TodoDto[];
  archivedTodos: ArchivedTodoDto[];
  settings: SettingsKv[];
}

export interface ParsedV3Export {
  ok: boolean;
  data?: V3ExportFile;
  /** ok=false 时的人类可读原因（用于 UI 提示）。 */
  reason?: string;
}

/** 宽容解析 + 结构校验：旧版 JSON、损坏文件、字段缺失统一给出明确原因。 */
export function parseV3Export(raw: string): ParsedV3Export {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: '文件不是有效的 JSON' };
  }
  if (typeof json !== 'object' || json === null) {
    return { ok: false, reason: '文件结构不符合 Celery Todo v3 格式' };
  }
  const obj = json as Record<string, unknown>;
  if (obj.format !== V3_FORMAT_ID) {
    return {
      ok: false,
      reason: '不支持的导出文件格式（仅支持 celery-todo/v3；2.x JSON 请先在 2.x 中使用）',
    };
  }
  if (typeof obj.formatVersion !== 'number' || obj.formatVersion > V3_EXPORT_FORMAT_VERSION) {
    return {
      ok: false,
      reason: `导出文件版本过新（formatVersion=${String(obj.formatVersion)}），请升级应用`,
    };
  }
  for (const key of ['projects', 'todos', 'archivedTodos', 'settings'] as const) {
    if (!Array.isArray(obj[key])) {
      return { ok: false, reason: `文件缺少 "${key}" 列表` };
    }
  }
  if (typeof obj.exportedAt !== 'string') {
    return { ok: false, reason: '文件缺少 "exportedAt" 时间戳' };
  }
  return { ok: true, data: obj as unknown as V3ExportFile };
}

/** 序列化为带 BOM 之外纯 UTF-8 JSON（BOM 由下载层按需添加）。 */
export function serializeV3Export(file: V3ExportFile): string {
  return JSON.stringify(file, null, 2);
}
