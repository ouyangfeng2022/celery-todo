/**
 * @file 本地计划日期与时间桶单元测试
 */

import { describe, expect, it } from 'vitest';
import {
  addLocalDays,
  classifyPlannedDate,
  daysBetween,
  defaultPlannedDateForBucket,
  formatLocalDate,
  getPlanningBoundaries,
  nextMonday,
  startOfWeekMonday,
} from '../utils/planning';

describe('planning', () => {
  describe('本地日历运算', () => {
    it('应按本地年月日格式化日期', () => {
      expect(formatLocalDate(new Date(2026, 7, 10, 23, 59))).toBe('2026-08-10');
    });

    it('应正确跨越月末、年末和闰日', () => {
      expect(addLocalDays('2026-01-31', 1)).toBe('2026-02-01');
      expect(addLocalDays('2026-12-31', 1)).toBe('2027-01-01');
      expect(addLocalDays('2024-02-28', 1)).toBe('2024-02-29');
      expect(addLocalDays('2024-03-01', -1)).toBe('2024-02-29');
    });

    it('应计算无时区漂移的日历日差', () => {
      expect(daysBetween('2026-12-31', '2027-01-02')).toBe(2);
      expect(daysBetween('2027-01-02', '2026-12-31')).toBe(-2);
    });

    it('应以周一为一周起点，并返回严格晚于当前日的下个周一', () => {
      expect(startOfWeekMonday('2026-08-10')).toBe('2026-08-10');
      expect(startOfWeekMonday('2026-08-16')).toBe('2026-08-10');
      expect(nextMonday('2026-08-10')).toBe('2026-08-17');
      expect(nextMonday('2026-08-16')).toBe('2026-08-17');
    });

    it('应拒绝格式错误或不存在的日期', () => {
      expect(() => addLocalDays('2026-8-01', 1)).toThrow(RangeError);
      expect(() => daysBetween('2026-02-29', '2026-03-01')).toThrow(RangeError);
      expect(() => startOfWeekMonday('not-a-date')).toThrow(RangeError);
      expect(() => addLocalDays('2026-08-10', 1.5)).toThrow(RangeError);
      expect(() => formatLocalDate(new Date(Number.NaN))).toThrow(RangeError);
    });
  });

  describe('计划边界', () => {
    it('周一应覆盖到当周周日', () => {
      expect(getPlanningBoundaries(new Date(2026, 7, 10, 18))).toEqual({
        today: '2026-08-10',
        tomorrow: '2026-08-11',
        weekEnd: '2026-08-16',
        nextWeekStart: '2026-08-17',
      });
    });

    it('周日的本周边界应为当天', () => {
      expect(getPlanningBoundaries(new Date(2026, 7, 16, 18))).toEqual({
        today: '2026-08-16',
        tomorrow: '2026-08-17',
        weekEnd: '2026-08-16',
        nextWeekStart: '2026-08-17',
      });
    });
  });

  describe('时间桶分类', () => {
    const now = new Date(2026, 7, 12, 23, 30); // 周三

    it('各时间桶应互斥', () => {
      expect(classifyPlannedDate(undefined, false, now)).toBe('unscheduled');
      expect(classifyPlannedDate('2026-08-11', false, now)).toBe('replan');
      expect(classifyPlannedDate('2026-08-12', false, now)).toBe('today');
      expect(classifyPlannedDate('2026-08-13', false, now)).toBe('tomorrow');
      expect(classifyPlannedDate('2026-08-14', false, now)).toBe('week');
      expect(classifyPlannedDate('2026-08-16', false, now)).toBe('week');
      expect(classifyPlannedDate('2026-08-17', false, now)).toBe('later');
    });

    it('已完成的过期事项不应进入重新规划桶', () => {
      expect(classifyPlannedDate('2026-08-11', true, now)).toBeNull();
      expect(classifyPlannedDate('2026-08-12', true, now)).toBe('today');
    });

    it('周末不应产生不存在的本周范围', () => {
      const saturday = new Date(2026, 7, 15, 12);
      expect(classifyPlannedDate('2026-08-16', false, saturday)).toBe('tomorrow');
      expect(classifyPlannedDate('2026-08-17', false, saturday)).toBe('later');
    });

    it('应拒绝无效计划日期', () => {
      expect(() => classifyPlannedDate('2026-13-01', false, now)).toThrow(RangeError);
    });
  });

  describe('时间桶默认日期', () => {
    it('应为工作日的各桶提供互斥默认值', () => {
      const now = new Date(2026, 7, 12, 10); // 周三
      expect(defaultPlannedDateForBucket('replan', now)).toBe('2026-08-12');
      expect(defaultPlannedDateForBucket('today', now)).toBe('2026-08-12');
      expect(defaultPlannedDateForBucket('tomorrow', now)).toBe('2026-08-13');
      expect(defaultPlannedDateForBucket('week', now)).toBe('2026-08-14');
      expect(defaultPlannedDateForBucket('later', now)).toBe('2026-08-17');
      expect(defaultPlannedDateForBucket('unscheduled', now)).toBeUndefined();
    });

    it('周六和周日没有可用的本周默认日期', () => {
      expect(defaultPlannedDateForBucket('week', new Date(2026, 7, 15))).toBeUndefined();
      expect(defaultPlannedDateForBucket('week', new Date(2026, 7, 16))).toBeUndefined();
    });
  });
});
