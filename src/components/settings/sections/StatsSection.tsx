/**
 * @file StatsSection - 设置页「统计」子页面
 * @description
 *   跨项目展示：顶部指标卡片行 + GitHub 风格贡献热力图 + 优先级/项目分布。
 *   数据范围支持「全部项目 / 单个项目」切换；
 *   热力图支持「按完成日 / 按新建日」切换；
 *   「包含已归档」开关开启后，把 deleted_todos 表的归档事项一并纳入统计。
 *
 *   数据所有权下沉到本组件：挂载时一次性读取 todos（+ 可选归档），切换范围 / 模式
 *   时只重算派生数据。所有图表（热力图、堆叠条、迷你进度条）都用 div + CSS 变量自绘，
 *   零图表依赖，颜色随主题（橙/celery 绿）自动切换。
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { Project, Todo } from '../../../types';
import { PRIORITY_LABELS, PRIORITY_SOLID, type Priority } from '../../../types';
import * as data from '../../../utils/dataGateway';
import {
  buildHeatmap,
  computeStreaks,
  groupByPriority,
  groupByProject,
  summarize,
  type HeatmapMode,
} from '../../../utils/stats';

interface StatsSectionProps {
  /** 全部项目（项目选择器 + 项目分布用） */
  projects: Project[];
}

const STATS_WEEKS = 26; // ≈ 半年视图，与截图一致

const HEATMAP_MODE_OPTIONS: { value: HeatmapMode; label: string }[] = [
  { value: 'completedAt', label: '按完成' },
  { value: 'createdAt', label: '按新建' },
];

/** 热力图 level → 强度（用 color-mix 自动跟随 --accent 主题色） */
const LEVEL_COLOR: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'var(--bg-hover)',
  1: 'color-mix(in srgb, var(--accent) 28%, transparent)',
  2: 'color-mix(in srgb, var(--accent) 50%, transparent)',
  3: 'color-mix(in srgb, var(--accent) 72%, transparent)',
  4: 'var(--accent)',
};

const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''] as const;
const MONTH_LABELS = [
  '1月',
  '2月',
  '3月',
  '4月',
  '5月',
  '6月',
  '7月',
  '8月',
  '9月',
  '10月',
  '11月',
  '12月',
];

/**
 * 「包含已归档」持久化键（settings 表 K/V，不入 AppSettings 大对象）。
 * 与 useFilter 的 `filter.<pid>` 同一模式：默认 false，老数据缺失键时回退默认。
 */
const ARCHIVED_KEY = 'stats.includeArchived';
export function StatsSection({ projects }: StatsSectionProps) {
  // 只有统计页挂载时才订阅 revision。日常待办操作只递增轻量计数，
  // 不会触发 getAllTodos() 或图表计算。
  const [dataRevision, setDataRevision] = useState(0);
  // 范围：'all' = 全部项目；其他 = 单个项目 id（会话状态，不持久化）
  const [scope, setScope] = useState<string>('all');
  // 热力图模式：按完成日 / 按新建日
  const [mode, setMode] = useState<HeatmapMode>('completedAt');
  // 是否把已归档事项（deleted_todos）一并纳入统计（持久化到 settings 表）
  const [includeArchived, setIncludeArchivedState] = useState(false);
  const [activeTodos, setActiveTodos] = useState<Todo[]>([]);
  const [archivedTodos, setArchivedTodos] = useState<Todo[]>([]);

  useEffect(() => {
    void data.getSetting(ARCHIVED_KEY).then((value) => setIncludeArchivedState(value === 'true'));
    if (data.isNativeDatabase()) {
      return data.onDataChanged(() => setDataRevision((revision) => revision + 1));
    }
    let unsubscribe: (() => void) | undefined;
    void import('../../../utils/database').then((db) => {
      unsubscribe = db.subscribeDataRevision(() => setDataRevision((revision) => revision + 1));
    });
    return () => unsubscribe?.();
  }, []);

  const setIncludeArchived = useCallback((value: boolean) => {
    setIncludeArchivedState(value);
    void data.setSetting(ARCHIVED_KEY, String(value));
  }, []);

  // ===== 数据源：正常事项 + （可选）归档事项 =====
  // revision 覆盖正常事项、归档、导入/恢复与其它窗口同步；统计页打开后才读取全量数据。
  useEffect(() => {
    let cancelled = false;
    void Promise.all([data.getAllTodos(), includeArchived ? data.getAllDeletedTodos() : Promise.resolve([])])
      .then(([normal, archived]) => {
        if (!cancelled) {
          setActiveTodos(normal);
          setArchivedTodos(archived);
        }
      });
    return () => { cancelled = true; };
  }, [dataRevision, includeArchived]);
  const allTodos = useMemo(
    () => (archivedTodos.length > 0 ? [...activeTodos, ...archivedTodos] : activeTodos),
    [activeTodos, archivedTodos],
  );

  const visibleTodos = useMemo(() => {
    if (scope === 'all') return allTodos;
    return allTodos.filter((t) => t.projectId === scope);
  }, [allTodos, scope]);

  // ===== 派生统计 =====
  const summaryData = useMemo(() => summarize(visibleTodos), [visibleTodos]);
  const heatmap = useMemo(
    () => buildHeatmap(visibleTodos, mode, STATS_WEEKS),
    [visibleTodos, mode],
  );
  const streaks = useMemo(() => computeStreaks(heatmap), [heatmap]);
  const prioritySlices = useMemo(() => groupByPriority(visibleTodos), [visibleTodos]);
  const projectStats = useMemo(
    () => groupByProject(visibleTodos, projects).slice(0, 6),
    [visibleTodos, projects],
  );

  return (
    <section>
      <h3 className="claude-eyebrow mb-3" style={{ color: 'var(--text-secondary)' }}>
        统计
      </h3>

      {/* 控制条：范围 / 热力图模式 / 包含已归档 */}
      <StatsToolbar
        scope={scope}
        onScopeChange={setScope}
        projects={projects}
        mode={mode}
        onModeChange={setMode}
        includeArchived={includeArchived}
        onIncludeArchivedChange={setIncludeArchived}
      />

      <div className="mt-6">
        <StatCardRow summary={summaryData} streaks={streaks} mode={mode} />
      </div>

      <div className="mt-6">
        <HeatmapSection cells={heatmap} mode={mode} weeks={STATS_WEEKS} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PriorityDistribution slices={prioritySlices} total={summaryData.total} />
        <ProjectDistribution stats={projectStats} />
      </div>
    </section>
  );
}

// ============================================
// 子组件：控制条
// ============================================

interface StatsToolbarProps {
  scope: string;
  onScopeChange: (scope: string) => void;
  projects: Project[];
  mode: HeatmapMode;
  onModeChange: (mode: HeatmapMode) => void;
  includeArchived: boolean;
  onIncludeArchivedChange: (value: boolean) => void;
}

const StatsToolbar = memo(function StatsToolbar({
  scope,
  onScopeChange,
  projects,
  mode,
  onModeChange,
  includeArchived,
  onIncludeArchivedChange,
}: StatsToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label
            className="text-xs font-semibold"
            style={{ color: 'var(--text-tertiary)' }}
            htmlFor="stats-scope"
          >
            范围
          </label>
          <select
            id="stats-scope"
            value={scope}
            onChange={(e) => onScopeChange(e.target.value)}
            className="rounded-md border-none px-2.5 py-1.5 text-[13px] cursor-pointer transition-colors"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
            }}
          >
            <option value="all">全部项目</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* 包含已归档：开关。归档事项纳入统计后，热力图/卡片/分布都会反映历史删除的数据 */}
        <label
          className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-semibold"
          style={{ color: 'var(--text-tertiary)' }}
          title="开启后，已归档（删除）的事项也一并计入统计"
        >
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => onIncludeArchivedChange(e.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
          />
          包含已归档
        </label>
      </div>

      {/* 热力图模式 segmented control，借用 FilterBar 的视觉节奏 */}
      <div
        className="flex items-center gap-0.5 p-0.5 rounded-lg"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        {HEATMAP_MODE_OPTIONS.map((option) => {
          const isActive = mode === option.value;
          return (
            <button
              key={option.value}
              onClick={() => onModeChange(option.value)}
              className="relative rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors"
              style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
            >
              {isActive && (
                <motion.div
                  layoutId="stats-mode-pill"
                  className="absolute inset-0 rounded-md"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    boxShadow: 'var(--shadow-xs)',
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

// ============================================
// 子组件：顶部指标卡片行
// ============================================

interface StatCardRowProps {
  summary: ReturnType<typeof summarize>;
  streaks: ReturnType<typeof computeStreaks>;
  mode: HeatmapMode;
}

const StatCardRow = memo(function StatCardRow({ summary, streaks, mode }: StatCardRowProps) {
  const verb = mode === 'completedAt' ? '完成' : '新建';
  const todayValue = mode === 'completedAt' ? summary.todayCompleted : summary.todayCreated;
  const weekValue = mode === 'completedAt' ? summary.weekCompleted : summary.weekCreated;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label={`今日${verb}`} value={todayValue} />
      <StatCard label={`本周${verb}`} value={weekValue} />
      <StatCard label="累计完成" value={summary.completed} />
      <StatCard label="当前连续" value={streaks.current} suffix="天" />
    </div>
  );
});

interface StatCardProps {
  label: string;
  value: number;
  suffix?: string;
}

const StatCard = memo(function StatCard({ label, value, suffix }: StatCardProps) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        borderColor: 'var(--border-color)',
      }}
    >
      <p className="mb-1.5 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </p>
      <p className="flex items-baseline gap-1">
        <span
          className="font-serif tabular-nums leading-none select-none"
          style={{
            fontSize: '32px',
            fontWeight: 700,
            color: 'var(--accent)',
            letterSpacing: '-0.02em',
          }}
        >
          {value}
        </span>
        {suffix && (
          <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {suffix}
          </span>
        )}
      </p>
    </div>
  );
});

// ============================================
// 子组件：热力图（自绘 tooltip）
// ============================================

interface HeatmapSectionProps {
  cells: ReturnType<typeof buildHeatmap>;
  mode: HeatmapMode;
  weeks: number;
}

interface TooltipState {
  x: number;
  y: number;
  content: string;
}

const HeatmapSection = memo(function HeatmapSection({ cells, mode, weeks }: HeatmapSectionProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // 把 cells（按日期升序的 weeks*7 个）切成 weeks 列 × 7 行
  const columns: (typeof cells)[] = [];
  for (let w = 0; w < weeks; w++) {
    columns.push(cells.slice(w * 7, w * 7 + 7));
  }

  const verb = mode === 'completedAt' ? '完成' : '新建';

  // 月份标签：遍历每列，取列首日期的月份；与上一列不同则标记
  const monthLabels = columns.map((col, idx) => {
    const first = col[0];
    if (!first) return null;
    const month = Number(first.date.slice(5, 7));
    const prevMonth =
      idx > 0 && columns[idx - 1][0] ? Number(columns[idx - 1][0].date.slice(5, 7)) : null;
    if (prevMonth === month) return null;
    return MONTH_LABELS[month - 1];
  });

  return (
    <section
      className="rounded-xl border p-5"
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        borderColor: 'var(--border-color)',
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {verb}热力图 · 近 {weeks} 周
        </h2>
        {/* 图例 */}
        <div
          className="flex items-center gap-1.5 text-[11px]"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <span>少</span>
          {([0, 1, 2, 3, 4] as const).map((lv) => (
            <span
              key={lv}
              aria-hidden="true"
              style={{
                width: 11,
                height: 11,
                borderRadius: 2,
                backgroundColor: LEVEL_COLOR[lv],
              }}
            />
          ))}
          <span>多</span>
        </div>
      </div>

      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {/* 星期标签列 */}
        <div className="flex flex-col gap-[3px] pr-1" style={{ color: 'var(--text-tertiary)' }}>
          {WEEKDAY_LABELS.map((label, i) => (
            <div key={i} className="text-[10px] leading-[11px] h-[11px] w-7 text-right">
              {label}
            </div>
          ))}
        </div>

        {/* 月份标签 + 网格 */}
        <div className="flex flex-col gap-[3px]">
          {/* 月份行 */}
          <div className="flex gap-[3px]" style={{ height: 14 }}>
            {monthLabels.map((label, idx) => (
              <div
                key={idx}
                // 容器宽度对齐单列（11px），但文字用 whitespace-nowrap 允许溢出。
                // 同一个月后续列的 label 都是 null，自然留出空间放完整「X月」，
                // 否则会被压在 11px 里折成「2 / 月」两行。
                className="text-[10px] leading-none w-[11px] whitespace-nowrap"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* 网格本体：每列 7 行 */}
          <div className="flex gap-[3px]">
            {columns.map((col, colIdx) => (
              <div key={colIdx} className="flex flex-col gap-[3px]">
                {col.map((cell) => (
                  <div
                    key={cell.date}
                    className="heatmap-cell"
                    onMouseEnter={(e) =>
                      setTooltip({
                        x: e.clientX,
                        y: e.clientY,
                        content: `${cell.date} · ${verb} ${cell.count} 项`,
                      })
                    }
                    onMouseMove={(e) =>
                      setTooltip((prev) =>
                        prev
                          ? { ...prev, x: e.clientX, y: e.clientY }
                          : {
                              x: e.clientX,
                              y: e.clientY,
                              content: `${cell.date} · ${verb} ${cell.count} 项`,
                            },
                      )
                    }
                    onMouseLeave={() => setTooltip(null)}
                    style={{
                      width: 11,
                      height: 11,
                      borderRadius: 2,
                      backgroundColor: LEVEL_COLOR[cell.level],
                      cursor: 'default',
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 自绘 tooltip：fixed 定位跟随鼠标，pointer-events:none 不拦截下方格子 */}
      {tooltip && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: tooltip.x + 12,
            top: tooltip.y + 12,
            pointerEvents: 'none',
            zIndex: 50,
            padding: '4px 8px',
            borderRadius: 6,
            fontSize: 11,
            whiteSpace: 'nowrap',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {tooltip.content}
        </div>
      )}
    </section>
  );
});

// ============================================
// 子组件：优先级分布（水平堆叠条）
// ============================================

interface PriorityDistributionProps {
  slices: ReturnType<typeof groupByPriority>;
  total: number;
}

const PriorityDistribution = memo(function PriorityDistribution({
  slices,
  total,
}: PriorityDistributionProps) {
  const order: Priority[] = ['high', 'medium', 'low'];
  const ordered = order.map((p) => slices.find((s) => s.priority === p)!).filter(Boolean);
  const max = Math.max(...slices.map((s) => s.count), 1);

  return (
    <section
      className="rounded-xl border p-5"
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        borderColor: 'var(--border-color)',
      }}
    >
      <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        优先级分布
      </h2>

      {/* 堆叠条：宽度按计数比例 */}
      {total > 0 ? (
        <div
          className="mb-4 flex h-2.5 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: 'var(--bg-hover)' }}
        >
          {ordered.map((slice) => (
            <div
              key={slice.priority}
              style={{
                width: `${(slice.count / total) * 100}%`,
                backgroundColor: PRIORITY_SOLID[slice.priority],
              }}
            />
          ))}
        </div>
      ) : (
        <p className="mb-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          暂无事项
        </p>
      )}

      {/* 图例 + 计数 */}
      <div className="space-y-2">
        {ordered.map((slice) => (
          <div key={slice.priority} className="flex items-center gap-2 text-[13px]">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: PRIORITY_SOLID[slice.priority] }}
            />
            <span className="flex-1" style={{ color: 'var(--text-secondary)' }}>
              {PRIORITY_LABELS[slice.priority]}
            </span>
            {/* 迷你柱：相对最大值的比例 */}
            <div
              className="h-1.5 w-16 overflow-hidden rounded-full"
              style={{ backgroundColor: 'var(--bg-hover)' }}
            >
              <div
                style={{
                  width: `${(slice.count / max) * 100}%`,
                  backgroundColor: PRIORITY_SOLID[slice.priority],
                  height: '100%',
                }}
              />
            </div>
            <span className="w-8 text-right tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
              {slice.count}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
});

// ============================================
// 子组件：项目分布
// ============================================

interface ProjectDistributionProps {
  stats: ReturnType<typeof groupByProject>;
}

const ProjectDistribution = memo(function ProjectDistribution({ stats }: ProjectDistributionProps) {
  return (
    <section
      className="rounded-xl border p-5"
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        borderColor: 'var(--border-color)',
      }}
    >
      <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        项目分布
      </h2>

      {stats.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          暂无事项
        </p>
      ) : (
        <div className="space-y-3">
          {stats.map(({ project, total, completed, rate }) => (
            <div key={project.id} className="flex items-center gap-2 text-[13px]">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: project.color ?? 'var(--accent)' }}
              />
              <span
                className="w-28 truncate"
                style={{ color: 'var(--text-secondary)' }}
                title={project.name}
              >
                {project.name}
              </span>
              <div
                className="h-1.5 flex-1 overflow-hidden rounded-full"
                style={{ backgroundColor: 'var(--bg-hover)' }}
              >
                <div
                  style={{
                    width: `${rate}%`,
                    backgroundColor: 'var(--accent)',
                    height: '100%',
                  }}
                />
              </div>
              <span className="tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                {completed}/{total}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
});
