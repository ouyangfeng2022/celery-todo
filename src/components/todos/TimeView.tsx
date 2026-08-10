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
  getPlanningBoundaries,
} from '../../utils/planning';
import { AddTodoInput } from './AddTodoInput';
import { TodoItem } from './TodoItem';

interface TimeViewProps {
  projects: Project[];
  onInboxCreated: (project: Project) => void;
  onOpenProject: (projectId: string, todoId: string) => void;
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
  const defaultDate = defaultPlannedDateForBucket(state.bucket);
  const canCompose = state.bucket !== 'replan' && (state.bucket !== 'week' || defaultDate);

  return (
    <div className="mx-auto max-w-4xl px-5 pb-10 pt-7 lg:px-10 lg:pt-12">
      {canCompose && (
        <div className="mb-8 space-y-2">
          <div
            className="flex items-center justify-end gap-2 px-1 text-xs"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <span>归入</span>
            <select
              value={targetProjectId}
              onChange={(event) => setTargetProjectId(event.target.value)}
              className="rounded-md border-none px-2 py-1"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
              aria-label="新事项所属项目"
            >
              <option value="">收集箱</option>
              {projects
                .filter((project) => project.kind === 'user')
                .map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
            </select>
          </div>
          <AddTodoInput
            projectId={`time:${state.bucket}:${targetProjectId || 'inbox'}`}
            defaultPlannedDate={defaultDate}
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
        </div>
      )}

      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {TIME_BUCKET_LABELS[state.bucket]}
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            跨项目查看计划事项
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

      {todos.length === 0 ? (
        <div
          className="rounded-xl px-5 py-12 text-center"
          style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}
        >
          {state.bucket === 'replan'
            ? '没有需要重新安排的事项'
            : `“${TIME_BUCKET_LABELS[state.bucket]}”还没有事项`}
        </div>
      ) : (
        <div className="space-y-1">
          {todos.map((todo) => {
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
                    className="hover:underline"
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
          })}
        </div>
      )}
    </div>
  );
}
