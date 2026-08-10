/** 计划日期使用本地日历日，不携带时间或时区。 */
export type LocalDate = string;

export type TimeBucket = 'replan' | 'today' | 'tomorrow' | 'week' | 'later' | 'unscheduled';

export interface PlanningBoundaries {
  today: LocalDate;
  tomorrow: LocalDate;
  weekEnd: LocalDate;
  nextWeekStart: LocalDate;
}

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseLocalDate(value: LocalDate): DateParts {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) throw new RangeError(`无效的本地日期: ${value}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`无效的本地日期: ${value}`);
  }
  return { year, month, day };
}

function assertValidDate(date: Date): void {
  if (Number.isNaN(date.getTime())) throw new RangeError('无效的 Date 对象');
}

function toLocalDateObject(value: LocalDate): Date {
  const { year, month, day } = parseLocalDate(value);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  // 使用中午避开部分时区在午夜发生的夏令时切换。
  date.setHours(12, 0, 0, 0);
  return date;
}

function toUtcDayNumber(value: LocalDate): number {
  const { year, month, day } = parseLocalDate(value);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getTime() / MILLISECONDS_PER_DAY;
}

/** 将 Date 按本地日历格式化，避免 UTC 转换造成日期漂移。 */
export function formatLocalDate(date: Date): LocalDate {
  assertValidDate(date);
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 按本地日历增加天数。 */
export function addLocalDays(date: LocalDate, days: number): LocalDate {
  if (!Number.isInteger(days)) throw new RangeError(`天数必须是整数: ${days}`);
  const result = toLocalDateObject(date);
  result.setDate(result.getDate() + days);
  assertValidDate(result);
  return formatLocalDate(result);
}

/** 返回 to 相对 from 的日历日差，不受夏令时影响。 */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return toUtcDayNumber(to) - toUtcDayNumber(from);
}

/** 返回所在周的周一。 */
export function startOfWeekMonday(date: LocalDate): LocalDate {
  const localDate = toLocalDateObject(date);
  const weekday = localDate.getDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  return addLocalDays(date, -daysSinceMonday);
}

/** 返回严格晚于给定日期的下一个周一。 */
export function nextMonday(date: LocalDate): LocalDate {
  return addLocalDays(startOfWeekMonday(date), 7);
}

export function getPlanningBoundaries(now: Date = new Date()): PlanningBoundaries {
  const today = formatLocalDate(now);
  const weekday = now.getDay();
  const weekEnd = addLocalDays(today, weekday === 0 ? 0 : 7 - weekday);
  return {
    today,
    tomorrow: addLocalDays(today, 1),
    weekEnd,
    nextWeekStart: addLocalDays(weekEnd, 1),
  };
}

/** 按互斥的时间范围对计划日期分类。 */
export function classifyPlannedDate(
  plannedDate: LocalDate | undefined,
  completed: boolean,
  now: Date = new Date(),
): TimeBucket | null {
  if (plannedDate === undefined) return 'unscheduled';

  const boundaries = getPlanningBoundaries(now);
  const distance = daysBetween(boundaries.today, plannedDate);
  if (distance < 0) return completed ? null : 'replan';
  if (distance === 0) return 'today';
  if (distance === 1) return 'tomorrow';
  if (daysBetween(plannedDate, boundaries.weekEnd) >= 0) return 'week';
  return 'later';
}

/** 返回在指定时间桶中创建事项时使用的默认计划日期。 */
export function defaultPlannedDateForBucket(
  bucket: TimeBucket,
  now: Date = new Date(),
): LocalDate | undefined {
  const boundaries = getPlanningBoundaries(now);
  switch (bucket) {
    case 'replan':
    case 'today':
      return boundaries.today;
    case 'tomorrow':
      return boundaries.tomorrow;
    case 'week': {
      const dayAfterTomorrow = addLocalDays(boundaries.today, 2);
      return daysBetween(dayAfterTomorrow, boundaries.weekEnd) >= 0 ? dayAfterTomorrow : undefined;
    }
    case 'later':
      return boundaries.nextWeekStart;
    case 'unscheduled':
      return undefined;
  }
}
