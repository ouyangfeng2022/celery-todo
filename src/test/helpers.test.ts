/**
 * @file 工具函数单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  isOverdue,
  isDueSoon,
  daysUntil,
  formatDate,
  debounce,
  generateId,
  safeJsonParse,
} from '../utils/helpers';

describe('helpers', () => {
  describe('isOverdue', () => {
    it('应正确识别过期事项', () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      expect(isOverdue(pastDate)).toBe(true);
    });

    it('应正确识别未过期事项', () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      expect(isOverdue(futureDate)).toBe(false);
    });

    it('无截止日期应返回 false', () => {
      expect(isOverdue(undefined)).toBe(false);
    });
  });

  describe('isDueSoon', () => {
    it('应在 24 小时内到期时返回 true', () => {
      const soon = new Date(Date.now() + 12 * 3600000).toISOString();
      expect(isDueSoon(soon, 24)).toBe(true);
    });

    it('应在超过 24 小时时返回 false', () => {
      const later = new Date(Date.now() + 48 * 3600000).toISOString();
      expect(isDueSoon(later, 24)).toBe(false);
    });
  });

  describe('daysUntil', () => {
    it('应正确计算剩余天数', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      expect(daysUntil(tomorrow.toISOString())).toBe(1);
    });

    it('无日期应返回 null', () => {
      expect(daysUntil(undefined)).toBeNull();
    });
  });

  describe('formatDate', () => {
    it('今天', () => {
      const today = new Date().toISOString();
      expect(formatDate(today)).toBe('今天');
    });

    it('明天', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(formatDate(tomorrow.toISOString())).toBe('明天');
    });
  });

  describe('debounce', () => {
    it('应延迟执行', async () => {
      const mockFn = vi.fn();
      const debounced = debounce(mockFn, 100);
      debounced();
      debounced();
      expect(mockFn).not.toHaveBeenCalled();
      await new Promise((r) => setTimeout(r, 150));
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('generateId', () => {
    it('应生成唯一 ID', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
      expect(id1.length).toBeGreaterThan(0);
    });
  });

  describe('safeJsonParse', () => {
    it('应正确解析有效 JSON', () => {
      expect(safeJsonParse('{"a":1}', null)).toEqual({ a: 1 });
    });

    it('应返回 fallback', () => {
      expect(safeJsonParse('invalid', 'fallback')).toBe('fallback');
    });
  });
});
