import { useMemo, useState } from 'react';
import type { FilterType, Project } from '../../types';
import {
  useTimeViewStore,
  selectTimeBucketTodos,
  TIME_BUCKET_LABELS,
} from '../../store/useTimeViewStore';
import {
  addLocalDays,
  defaultPlannedDateForBucket,
  formatLocalDate,
  getCurrentWeekDates,
  getPlanningBoundaries,
} from '../../utils/planning';
import { PlusIcon } from '../common/Icons';
import { AddTodoInput } from './AddTodoInput';
import { TodoItem } from './TodoItem';

interface TimeViewProps {
  projects: Project[];
  onInboxCreated: (project: Project) => void;
  onOpenProject: (projectId: string, todoId?: string) => void;
}

const FILTERS: Array<{ value: FilterType; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '进行中' },
  { value: 'completed', label: '已完成' },
];

export function TimeView({ projects, onInboxCreated, onOpenProject }: TimeViewProps) {
  const state = useTimeViewStore();
  const todos = useMemo(() => selectTimeBucketTodos(state), [state]);
  const [targetProjectId, setTargetProjectId] = useState('');
  const weekDates = useMemo(() => getCurrentWeekDates(), []);
  const today = formatLocalDate(new Date());
  const [selectedWeekDate, setSelectedWeekDate] = useState(today);
  const [composerFocusSignal, setComposerFocusSignal] = useState(0);
  const defaultDate = defaultPlannedDateForBucket(state.bucket);
  const composeDate = state.bucket === 'week' ? selectedWeekDate : defaultDate;
  const canCompose = state.bucket !== 'replan';

  const focusComposerForDate = (date: string) => {
    setSelectedWeekDate(date);
    setComposerFocusSignal((signal) => signal + 1);
  };

  const renderTodo = (todo: (typeof todos)[number]) => {
    const project = projects.find((item) => item.id === todo.projectId);
    const boundaries = getPlanningBoundaries();
    return (
      <div key={todo.id} className="rounded-xl px-2 py-1 hover:bg-[var(--bg-hover)]">
        <div
          className="flex items-center justify-between gap-2 px-3 pt-1 text-[11px]"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <button
            type="button"
            className="truncate hover:underline"
            onClick={() => onOpenProject(todo.projectId, todo.id)}
          >
            {project?.name ?? '收集箱'}
          </button>
          <select
            value={todo.projectId}
            onChange={(event) => void state.move(todo.id, event.target.value)}
            className="max-w-32 rounded border-none bg-transparent px-1 py-0.5"
            aria-label={`移动“${todo.title}”到项目`}
          >
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        {state.bucket === 'replan' && (
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-1 text-[11px]">
            {[
              ['今天', boundaries.today],
              ['明天', boundaries.tomorrow],
              ['下周一', boundaries.nextWeekStart],
            ].map(([label, plannedDate]) => (
              <button
                key={label}
                type="button"
                className="rounded-md px-2 py-1 hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--accent)' }}
                onClick={() => void state.update(todo.id, { plannedDate })}
              >
                {label}
              </button>
            ))}
            <label
              className="cursor-pointer rounded-md px-2 py-1 hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--text-tertiary)' }}
            >
              自选日期
              <input
                type="date"
                className="sr-only"
                min={addLocalDays(boundaries.today, 0)}
                onChange={(event) => {
                  if (event.target.value) {
                    void state.update(todo.id, { plannedDate: event.target.value });
                  }
                }}
              />
            </label>
          </div>
        )}
        <TodoItem
          todo={todo}
          isSelected={false}
          selectable={false}
          onToggle={(id) => void state.toggle(id)}
          onEdit={(id, updates) => void state.update(id, updates)}
          onDelete={(id) => void state.archive(id)}
          onToggleSelect={() => undefined}
        />
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-4xl px-5 pb-10 pt-7 lg:px-10 lg:pt-12">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {state.bucket === 'week' ? '本周安排' : TIME_BUCKET_LABELS[state.bucket]}
          </h2>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {state.bucket === 'week'
              ? `${formatMonthDay(weekDates[0])} — ${formatMonthDay(weekDates[6])} · 按日期查看跨项目事项`
              : '跨项目查看计划事项'}
          </p>
        </div>
        {state.bucket !== 'replan' && (
          <div className="flex rounded-lg p-0.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => state.setFilter(item.value)}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors"
                style={{
                  color:
                    state.filter === item.value ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  backgroundColor:
                    state.filter === item.value ? 'var(--bg-tertiary)' : 'transparent',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {canCompose && (
        <section className="mb-9 space-y-3" aria-label="添加计划事项">
          {state.bucket === 'week' && (
            <div className="overflow-x-auto pb-1">
              <div
                className="grid min-w-[35rem] grid-cols-7 gap-1 rounded-xl p-1"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
                aria-label="选择本周计划日期"
              >
                {weekDates.map((date, index) => {
                  const selected = date === selectedWeekDate;
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setSelectedWeekDate(date)}
                      className="rounded-lg px-2 py-2 text-center transition-colors"
                      style={{
                        color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                        backgroundColor: selected ? 'var(--bg-primary)' : 'transparent',
                        boxShadow: selected ? 'var(--shadow-xs)' : undefined,
                      }}
                      aria-pressed={selected}
                      aria-label={`计划到${WEEKDAY_LABELS[index]} ${formatMonthDay(date)}`}
                    >
                      <span className="block text-xs font-medium">
                        {date === today ? '今天' : WEEKDAY_LABELS[index]}
                      </span>
                      <span className="mt-0.5 block text-[10px]" style={{ opacity: 0.72 }}>
                        {formatShortDate(date)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div
            className="flex items-center justify-end gap-2 px-1 text-xs"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <span>
              {state.bucket === 'week' ? `计划在 ${formatMonthDay(composeDate!)}` : '归入'}
            </span>
            {state.bucket === 'week' && <span aria-hidden="true">·</span>}
            {state.bucket === 'week' && <span>归入</span>}
            <select
              value={targetProjectId}
              onChange={(event) => setTargetProjectId(event.target.value)}
              className="rounded-md border-none px-2 py-1"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
              aria-label="新事项所属项目"
            >
              <option value="">收集箱</option>
              {projects
                .filter((project) => project.kind !== 'inbox')
                .map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
            </select>
          </div>
          <AddTodoInput
            projectId={`time:${state.bucket}:${composeDate ?? 'none'}:${targetProjectId || 'inbox'}`}
            defaultPlannedDate={composeDate}
            focusSignal={composerFocusSignal}
            onAdd={async (title, priority, description, plannedDate) => {
              const project = await state.add({
                rawTitle: title,
                priority,
                description,
                plannedDate,
                projectId: targetProjectId || undefined,
              });
              if (project.kind === 'inbox') onInboxCreated(project);
            }}
          />
        </section>
      )}

      {state.bucket === 'week' ? (
        <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
          {weekDates.map((date, index) => {
            const dayTodos = todos.filter((todo) => todo.plannedDate === date);
            const isToday = date === today;
            return (
              <section key={date} className="py-4 first:pt-0" aria-labelledby={`week-day-${date}`}>
                <div className="mb-2 flex min-h-9 items-center gap-3 px-2">
                  <div className="w-20 flex-shrink-0">
                    <h3
                      id={`week-day-${date}`}
                      className="text-sm font-semibold"
                      style={{ color: isToday ? 'var(--accent)' : 'var(--text-primary)' }}
                    >
                      {WEEKDAY_LABELS[index]}
                    </h3>
                    <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                      {formatMonthDay(date)}
                    </p>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {dayTodos.length > 0 ? `${dayTodos.length} 项` : '暂无事项'}
                  </span>
                  <button
                    type="button"
                    onClick={() => focusComposerForDate(date)}
                    className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ color: 'var(--accent)' }}
                    aria-label={`在${WEEKDAY_LABELS[index]}添加事项`}
                  >
                    <PlusIcon size={13} />
                    添加
                  </button>
                </div>
                {dayTodos.length > 0 && <div className="space-y-1">{dayTodos.map(renderTodo)}</div>}
              </section>
            );
          })}
        </div>
      ) : todos.length === 0 ? (
        <div
          className="rounded-xl px-5 py-12 text-center"
          style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}
        >
          {state.bucket === 'replan'
            ? '没有需要重新安排的事项'
            : `“${TIME_BUCKET_LABELS[state.bucket]}”还没有事项`}
        </div>
      ) : (
        <div className="space-y-1">{todos.map(renderTodo)}</div>
      )}
    </div>
  );
}

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function formatMonthDay(date: string): string {
  const [, month, day] = date.split('-');
  return `${Number(month)}月${Number(day)}日`;
}

function formatShortDate(date: string): string {
  const [, month, day] = date.split('-');
  return `${Number(month)}/${Number(day)}`;
}
