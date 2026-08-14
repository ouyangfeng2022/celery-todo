/**
 * v3 导出格式：解析/序列化与旧版拒绝规则。
 */

import { describe, expect, it } from 'vitest';
import {
  parseV3Export,
  serializeV3Export,
  V3_EXPORT_FORMAT_VERSION,
  V3_FORMAT_ID,
} from '../export-format';

const sample = {
  format: V3_FORMAT_ID,
  formatVersion: V3_EXPORT_FORMAT_VERSION,
  exportedAt: '2026-08-14T00:00:00.000Z',
  appVersion: '3.0.0-alpha.1',
  projects: [],
  todos: [],
  archivedTodos: [],
  settings: [],
};

describe('v3 导出格式', () => {
  it('合法文件往返保持等价', () => {
    const parsed = parseV3Export(serializeV3Export(sample));
    expect(parsed.ok).toBe(true);
    expect(parsed.data).toEqual(sample);
  });

  it('非 JSON / 非对象 / 缺列表字段给出明确原因', () => {
    expect(parseV3Export('not json{').ok).toBe(false);
    expect(parseV3Export('123').ok).toBe(false);
    expect(parseV3Export('{"format":"celery-todo/v3","formatVersion":1,"exportedAt":"x"}').ok).toBe(
      false,
    );
  });

  it('2.x 旧导出（无 format 标识）直接不支持', () => {
    const legacyV2 = JSON.stringify({
      version: 6,
      exportedAt: '2026-01-01T00:00:00.000Z',
      projects: [],
      todos: [],
      deletedTodos: [],
      settings: {},
    });
    const result = parseV3Export(legacyV2);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('不支持');
  });

  it('更新版本的 formatVersion 拒绝导入', () => {
    const newer = JSON.stringify({ ...sample, formatVersion: V3_EXPORT_FORMAT_VERSION + 1 });
    expect(parseV3Export(newer).ok).toBe(false);
  });
});
