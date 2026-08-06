/**
 * @file stats - 统计派生计算（纯函数）
 * @description
 *   把 raw Todo[] 转成统计页 UI 需要的结构。所有函数都是纯输入输出，
 *   不读 DB、不读 settings，便于 vitest 覆盖。
 *   组件层挂载时一次性读取 `getAllTodos` + `getAllProjects`，
 *   再把数组传进来按当前选中的范围 / 模式重算。
 */

import type { Todo, Project, Priority } from '../types';

// ============================================
// 公共类型
// ============================================

/** 热力图统计维度：按完成日 / 按新建日 */
export type HeatmapMode = 'completedAt' | 'createdAt';

/** 单个热力图格子 */
export interface HeatmapCell {
  /** 本地日期 'YYYY-MM-DD'（用作 key + tooltip，避免时区 flakiness） */
  date: string;
  /** 当天计数 */
  count: number;
  /** 颜色档位 0-4：0 = 无活动（最浅），4 = 最活跃 */
  level: 0 | 1 | 2 | 3 | 4;
}

/** 连续天数 */
export interface Streaks {
  /** 当前连续天数（含今天或昨天，否则 0） */
  current: number;
  /** 历史最长连续天数 */
  longest: number;
}

/** 顶部指标卡片汇总 */
export interface StatsSummary {
  /** 总事项数 */
  total: number;
  /** 已完成数 */
  completed: number;
  /** 待完成数 */
  active: number;
  /** 完成率（0-100，无事项时 0） */
  completionRate: number;
  /** 今日完成数 */
  todayCompleted: number;
  /** 本周完成数（周一为一周起点） */
  weekCompleted: number;
  /** 今日新建数 */
  todayCreated: number;
  /** 本周新建数（周一为一周起点） */
  weekCreated: number;
  /** 置顶事项数 */
  pinned: number;
}

/** 优先级分布单项 */
export interface PrioritySlice {
  priority: Priority;
  count: number;
}

/** 项目分布单项 */
export interface ProjectStat {
  project: Project;
  total: number;
  completed: number;
  /** 完成率 0-100 */
  rate: number;
}

// ============================================
// 日期工具（本地时区，ISO 字符串 → YYYY-MM-DD）
// ============================================

/** 把任意 Date 转成本地时区的 'YYYY-MM-DD'，避免 UTC 偏移把 23 点挪到次日 */
export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 'YYYY-MM-DD' 加 n 天，返回新的 'YYYY-MM-DD'（用本地 Date 做加法） */
function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toLocalDateKey(dt);
}

/** 今天的 'YYYY-MM-DD' */
function todayKey(): string {
  return toLocalDateKey(new Date());
}

/** 取 todo 的统计时间键：完成模式取 completedAt，新建模式取 createdAt；缺值返回 null */
function todoDateKey(todo: Todo, mode: HeatmapMode): string | null {
  const iso = mode === 'completedAt' ? todo.completedAt : todo.createdAt;
  if (!iso) return null;
  // 'YYYY-MM-DDTHH:mm:ss...' 取前 10 位，与本地日期键一致；避免 new Date(iso) 的 UTC 误差
  return iso.slice(0, 10);
}

// ============================================
// 热力图
// ============================================

/**
 * 构建热力图数据。
 *
 * - 起点 = 今天所在周的「上一周周日」，向前推 `weeks` 周；
 *   这样最后一列对齐本周，与 GitHub 的视觉一致。
 * - 按日历连续填充（含没有活动的日子），count = 0 归 level 0。
 * - level 1-4 用计数分位切档：>0 中的 P25/P50/P75 切分；只有一个非零值时
 *   全归 level 1，避免单点数据被拉满到 4。
 *
 * @param weeks 显示的周数（每周 7 格），默认 26（≈半年）
 */
export function buildHeatmap(todos: Todo[], mode: HeatmapMode, weeks = 26): HeatmapCell[] {
  if (weeks <= 0) return [];

  // 1. 按 'YYYY-MM-DD' 计数
  const counts = new Map<string, number>();
  for (const todo of todos) {
    const key = todoDateKey(todo, mode);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // 2. 算起点：让最后一列对齐「本周」（含今天）。
  //    本周日 = 今天 - dayOfWeek 天（getDay() 0=Sun..6=Sat，周日当天 offset=0）。
  //    再向前推 (weeks-1) 周，得到整段窗口的起点（也是一个周日）。
  const today = todayKey();
  const [ty, tm, td] = today.split('-').map(Number);
  const dayOfWeek = new Date(ty, tm - 1, td).getDay();
  const thisSunday = addDays(today, -dayOfWeek);
  const startSunday = addDays(thisSunday, -(weeks - 1) * 7);

  // 3. 连续填充 weeks*7 天
  const cells: HeatmapCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const date = addDays(startSunday, i);
    cells.push({ date, count: 0, level: 0 });
  }

  // 4. 写入计数
  for (const cell of cells) {
    cell.count = counts.get(cell.date) ?? 0;
  }

  // 5. 计算 level 阈值：仅在 count > 0 的格子里取分位
  const positives = cells
    .map((c) => c.count)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  if (positives.length > 0) {
    const at = (q: number) =>
      positives[Math.min(positives.length - 1, Math.floor(q * positives.length))];
    const q25 = at(0.25);
    const q50 = at(0.5);
    const q75 = at(0.75);
    for (const cell of cells) {
      if (cell.count <= 0) {
        cell.level = 0;
      } else if (cell.count <= q25) {
        cell.level = 1;
      } else if (cell.count <= q50) {
        cell.level = 2;
      } else if (cell.count <= q75) {
        cell.level = 3;
      } else {
        cell.level = 4;
      }
    }
  }

  return cells;
}

// ============================================
// 连续天数（streak）
// ============================================

/**
 * 基于热力图格子计算当前/最长连续天数。
 *
 * 「连续」按 'YYYY-MM-DD' 字符串相邻判定（addDays ±1），count > 0 算一天活动。
 * current streak：若今天有活动算起；今天没活动但昨天有，仍算作「未断」
 * （沿用 GitHub 的口径：今日未结束不直接清零）。
 *
 * @param cells 来自 buildHeatmap 的格子（按日期升序）
 */
export function computeStreaks(cells: HeatmapCell[]): Streaks {
  if (cells.length === 0) return { current: 0, longest: 0 };

  const active = new Set(cells.filter((c) => c.count > 0).map((c) => c.date));
  if (active.size === 0) return { current: 0, longest: 0 };

  // 把活动日升序排成数组，逐对比较相邻是否差一天
  const sorted = [...active].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (addDays(prev, 1) === cur) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }

  // current streak：从今天 / 昨天倒着数连续活动日
  const today = todayKey();
  const yesterday = addDays(today, -1);
  let cursor: string | null = active.has(today) ? today : active.has(yesterday) ? yesterday : null;
  let current = 0;
  while (cursor && active.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  return { current, longest };
}

// ============================================
// 顶部指标卡片汇总
// ============================================

/** 一周的起点：周一（与项目默认的周视图一致） */
function startOfWeekKey(): string {
  const today = todayKey();
  const [ty, tm, td] = today.split('-').map(Number);
  const dayOfWeek = new Date(ty, tm - 1, td).getDay(); // 0=Sun..6=Sat
  // 周日(0) → 6 天前；其他 → dayOfWeek-1 天前
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return addDays(today, -offset);
}

export function summarize(todos: Todo[]): StatsSummary {
  const total = todos.length;
  const completed = todos.filter((t) => t.completed).length;
  const active = total - completed;
  const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100);

  const today = todayKey();
  const weekStart = startOfWeekKey();

  let todayCompleted = 0;
  let weekCompleted = 0;
  let todayCreated = 0;
  let weekCreated = 0;
  for (const t of todos) {
    // createdAt 一定有值；completedAt 仅完成的事项有
    const createdKey = t.createdAt.slice(0, 10);
    if (createdKey === today) todayCreated += 1;
    if (createdKey >= weekStart && createdKey <= today) weekCreated += 1;
    if (!t.completedAt) continue;
    const completedKey = t.completedAt.slice(0, 10);
    if (completedKey === today) todayCompleted += 1;
    if (completedKey >= weekStart && completedKey <= today) weekCompleted += 1;
  }

  const pinned = todos.filter((t) => t.pinned).length;

  return {
    total,
    completed,
    active,
    completionRate,
    todayCompleted,
    weekCompleted,
    todayCreated,
    weekCreated,
    pinned,
  };
}

// ============================================
// 优先级 / 项目分布
// ============================================

/** 按优先级聚合（高/中/低 顺序，固定） */
export function groupByPriority(todos: Todo[]): PrioritySlice[] {
  const order: Priority[] = ['high', 'medium', 'low'];
  const counts: Record<Priority, number> = { high: 0, medium: 0, low: 0 };
  for (const t of todos) counts[t.priority] += 1;
  return order.map((priority) => ({ priority, count: counts[priority] }));
}

/**
 * 按项目聚合。仅返回该项目下有 todo 的项目（项目本身已存在）。
 * 排序：完成数倒序 → 总数倒序 → 项目 order 升序（与侧边栏顺序一致）。
 */
export function groupByProject(todos: Todo[], projects: Project[]): ProjectStat[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const acc = new Map<string, { total: number; completed: number }>();
  for (const t of todos) {
    const cur = acc.get(t.projectId) ?? { total: 0, completed: 0 };
    cur.total += 1;
    if (t.completed) cur.completed += 1;
    acc.set(t.projectId, cur);
  }
  return [...acc.entries()]
    .map(([projectId, { total, completed }]) => {
      const project = byId.get(projectId);
      if (!project) return null;
      return {
        project,
        total,
        completed,
        rate: total === 0 ? 0 : Math.round((completed / total) * 100),
      };
    })
    .filter((s): s is ProjectStat => s !== null)
    .sort((a, b) => {
      if (b.completed !== a.completed) return b.completed - a.completed;
      if (b.total !== a.total) return b.total - a.total;
      return a.project.order - b.project.order;
    });
}
