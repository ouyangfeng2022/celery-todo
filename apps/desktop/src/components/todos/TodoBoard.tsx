/**
 * @file TodoBoard - 按计划日期排列的事项卡片看板
 * @description 将项目事项按本地日历日分组，用自适应网格呈现每周计划
 */

import { memo, useEffect, useMemo } from 'react';
import type { FilterType, Todo } from '../../types';
import { addLocalDays, formatLocalDate, formatPlannedDate } from '../../utils/planning';
import { EmptyState } from '../common/EmptyState';
import { TodoItem } from './TodoItem';

interface TodoBoardProps {
  todos: Todo[];
  selectedIds: Set<string>;
  filter?: FilterType;
  hasTodos?: boolean;
  onToggle: (id: string) => void;
  onEdit: (id: string, updates: Partial<Todo>) => void;
  onDelete: (id: string) => void;
  onToggleSelect: (id: string) => void;
  /** 点击标题/空白区域 → 打开详情浮窗 */
  onOpenDetail: (id: string) => void;
  /** 全局搜索选中后定位并高亮的事项。 */
  focusTarget?: { id: string; signal: number } | null;
}

interface BoardGroup {
  key: string;
  date?: string;
  todos: Todo[];
}

const UNSCHEDULED_GROUP = '__unscheduled__';
const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 卡片模式保留完整语义结构与键盘可达性，但让 Chromium 跳过视口外卡片的布局和绘制。
// TodoItem 内含弹层、动画和多个操作按钮；大量卡片在项目切换时尤其受益。
const CARD_CONTENT_VISIBILITY_THRESHOLD = 30;

function boardDateLabel(date: string, today: string): { title: string; detail: string } {
  const match = LOCAL_DATE_PATTERN.exec(date);
  if (!match) return { title: date, detail: '计划日期' };

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const localDate = new Date(0);
  localDate.setFullYear(year, month - 1, day);
  localDate.setHours(12, 0, 0, 0);

  const tomorrow = addLocalDays(today, 1);
  const title =
    date === today
      ? '今天'
      : date === tomorrow
        ? '明天'
        : (WEEKDAY_LABELS[localDate.getDay()] ?? date);
  const detail = formatPlannedDate(date, today);
  return { title, detail };
}

function groupTodos(todos: Todo[]): BoardGroup[] {
  const groups = new Map<string, Todo[]>();
  todos.forEach((todo) => {
    const key = todo.plannedDate ?? UNSCHEDULED_GROUP;
    const group = groups.get(key);
    if (group) group.push(todo);
    else groups.set(key, [todo]);
  });

  return [...groups.entries()]
    .sort(([left], [right]) => {
      if (left === UNSCHEDULED_GROUP) return 1;
      if (right === UNSCHEDULED_GROUP) return -1;
      return left.localeCompare(right);
    })
    .map(([key, items]) => ({
      key,
      date: key === UNSCHEDULED_GROUP ? undefined : key,
      todos: items,
    }));
}

function TodoBoardComponent({
  todos,
  selectedIds,
  filter,
  hasTodos,
  onToggle,
  onEdit,
  onDelete,
  onToggleSelect,
  onOpenDetail,
  focusTarget,
}: TodoBoardProps) {
  const groups = useMemo(() => groupTodos(todos), [todos]);
  const today = formatLocalDate(new Date());
  const deferOffscreenCards = todos.length > CARD_CONTENT_VISIBILITY_THRESHOLD;

  useEffect(() => {
    if (!focusTarget || !todos.some((todo) => todo.id === focusTarget.id)) return;
    requestAnimationFrame(() => {
      document.getElementById(`todo-${focusTarget.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [focusTarget, todos]);

  if (todos.length === 0) {
    return <EmptyState filter={filter} hasTodos={hasTodos} />;
  }

  return (
    <div
      key={filter ?? 'all'}
      className="todo-filter-content grid grid-cols-[repeat(auto-fit,minmax(480px,1fr))] items-start gap-4"
      aria-label="按计划日期排列的事项卡片"
    >
      {groups.map((group) => {
        const label = group.date
          ? boardDateLabel(group.date, today)
          : { title: '未安排', detail: '暂不指定日期' };
        const needsReplan = Boolean(
          group.date && group.date < today && group.todos.some((todo) => !todo.completed),
        );

        return (
          <section
            key={group.key}
            className="min-w-0"
            aria-label={`${label.title}，${group.todos.length} 条事项`}
          >
            <header className="mb-2.5 flex min-h-9 items-end justify-between gap-3 px-1">
              <div className="min-w-0">
                <h3
                  className="truncate font-serif text-[15px] font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {label.title}
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  {group.date ? <time dateTime={group.date}>{label.detail}</time> : label.detail}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                {needsReplan && (
                  <span
                    className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-subtle)' }}
                  >
                    待重新安排
                  </span>
                )}
                <span
                  className="min-w-5 text-right text-xs tabular-nums"
                  style={{ color: 'var(--text-tertiary)' }}
                  aria-label={`${group.todos.length} 条事项`}
                >
                  {group.todos.length}
                </span>
              </div>
            </header>

            {/* 卡片墙：auto-fill 不折叠空轨道，卡片始终保持 ~220px 紧凑宽度，
                不会被容器宽度拉成"撑大的列表行"；grid 默认 stretch 让同行卡片等高。 */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {group.todos.map((todo) => (
                <div
                  key={todo.id}
                  id={`todo-${todo.id}`}
                  style={
                    deferOffscreenCards
                      ? { contentVisibility: 'auto', containIntrinsicSize: '180px' }
                      : undefined
                  }
                >
                  <TodoItem
                    todo={todo}
                    view="card"
                    isSelected={selectedIds.has(todo.id)}
                    focusSignal={todo.id === focusTarget?.id ? focusTarget.signal : undefined}
                    onToggle={onToggle}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onToggleSelect={onToggleSelect}
                    onOpenDetail={onOpenDetail}
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export const TodoBoard = memo(TodoBoardComponent);
