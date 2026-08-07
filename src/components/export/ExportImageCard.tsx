/**
 * @file ExportImageCard - 项目导出为图片时的卡片视觉
 * @description 纯展示组件，所有颜色走 CSS 变量，天然跟随当前主题
 *   （浅色 / 深色 / 纸张 / 芹菜）。统计信息始终基于全量 todos，
 *   filter 只影响展示哪些任务行。
 *
 * 截图工具会通过 forwardRef 拿到根节点 DOM；预览时也用同一组件实时渲染，
 *   所以主题切换会即时反映在预览里。
 */

import { forwardRef, useMemo } from 'react';
import type { Project, Todo } from '../../types';
import { PRIORITY_LABELS, PRIORITY_SOLID } from '../../types';
import { readProjectSort, sortTodos } from '../../utils/sortTodos';

/** 展示范围筛选 —— 头部统计始终基于全量，不受此影响 */
export type ExportImageFilter = 'all' | 'pending' | 'completed';

export interface ExportImageCardProps {
  project: Project;
  /** 该项目的全量 todos（统计口径以此为准） */
  todos: Todo[];
  /** 展示范围；切换只影响任务行列表 */
  filter: ExportImageFilter;
  /** 仅用于弹窗内预览；省略时渲染完整事项列表，供最终图片导出使用。 */
  maxItems?: number;
}

/** 卡片渲染宽度（CSS 像素）。导出时 pixelRatio: 2 → 1440px 物理像素 */
const CARD_WIDTH = 720;

/**
 * 把 ISO 日期格式化为「YYYY.MM.DD」。
 * 不依赖 locale，避免时区/分隔符差异影响导出可复现性。
 */
function formatChineseDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/**
 * 复用项目里主窗口同款的排序逻辑：读取该项目持久化的 sort 偏好
 * （settings 表 `sort.<projectId>`），用 sortTodos 排序。
 * 这样图片里的任务顺序与用户在项目中看到的完全一致 —— 无论是
 * 创建时间降序、按优先级、还是手动拖拽顺序。置顶项恒居顶。
 */
function orderAsProject(projectId: string, todos: Todo[]): Todo[] {
  return sortTodos(todos, readProjectSort(projectId));
}

/** 单行任务视觉：复选框 + 标题 + 优先级标签，与 TodoItem 风格对齐 */
function TodoRow({ todo }: { todo: Todo }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '10px 12px',
        borderRadius: 8,
        backgroundColor: todo.pinned ? 'var(--pinned-bg)' : 'transparent',
        boxShadow: todo.pinned ? 'inset 3px 0 var(--accent)' : undefined,
      }}
    >
      {/* 复选框：圆环（未完成） / 实心勾（已完成） */}
      <div
        style={{
          flexShrink: 0,
          width: 18,
          height: 18,
          marginTop: 2,
          borderRadius: '50%',
          border: `1.5px solid ${todo.completed ? 'var(--accent)' : 'var(--border-strong)'}`,
          backgroundColor: todo.completed ? 'var(--accent)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 11,
          lineHeight: 1,
          fontWeight: 700,
        }}
      >
        {todo.completed && '✓'}
      </div>

      {/* 标题 + 描述摘要 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            lineHeight: 1.45,
            color: todo.completed ? 'var(--text-tertiary)' : 'var(--text-primary)',
            textDecorationLine: todo.completed ? 'line-through' : 'none',
            wordBreak: 'break-word',
          }}
        >
          {todo.title}
        </div>
        {todo.description && (
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12.5,
              lineHeight: 1.4,
              color: 'var(--text-tertiary)',
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {todo.description}
          </div>
        )}
      </div>

      {/* 优先级标签：实心圆点 + 文字，颜色用 PRIORITY_SOLID 保持醒目 */}
      <div
        style={{
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          marginTop: 3,
          padding: '2px 8px',
          borderRadius: 9999,
          fontSize: 11.5,
          fontWeight: 600,
          fontFamily: 'var(--font-heading)',
          color: PRIORITY_SOLID[todo.priority],
          backgroundColor: `color-mix(in srgb, ${PRIORITY_SOLID[todo.priority]} 14%, transparent)`,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: PRIORITY_SOLID[todo.priority],
          }}
        />
        {PRIORITY_LABELS[todo.priority]}
      </div>
    </div>
  );
}

/** 一组任务的标题行（如「待办」「已完成 (5)」） */
function GroupHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 6,
        marginTop: 16,
        marginBottom: 4,
        fontFamily: 'var(--font-heading)',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--text-quaternary)',
      }}
    >
      {label}
      {count !== undefined && (
        <span style={{ fontWeight: 400, color: 'var(--text-quaternary)' }}>· {count}</span>
      )}
    </div>
  );
}

/** 进度条 + 完成统计 */
function ProgressBar({ total, completed }: { total: number; completed: number }) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
      <div
        style={{
          flex: 1,
          height: 8,
          borderRadius: 9999,
          backgroundColor: 'var(--bg-hover)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 9999,
            backgroundColor: 'var(--accent)',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <div
        style={{
          flexShrink: 0,
          fontFamily: 'var(--font-heading)',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {completed}/{total} · {pct}%
      </div>
    </div>
  );
}

export const ExportImageCard = forwardRef<HTMLDivElement, ExportImageCardProps>(
  function ExportImageCard({ project, todos, filter, maxItems }, ref) {
    // —— 统计口径始终基于全量 todos ——
    const total = todos.length;
    const completedCount = todos.filter((t) => t.completed).length;
    const pendingCount = total - completedCount;

    // —— 展示列表根据 filter 派生，顺序与项目主窗口完全一致 ——
    //    先按项目排序偏好整体排序，再按完成态分到「待办 / 已完成」两组，
    //    分组不改变组内的相对顺序（保持稳定）。
    const { pendingTodos, completedTodos } = useMemo(() => {
      const ordered = orderAsProject(project.id, todos);
      const pending = ordered.filter((t) => !t.completed);
      const done = ordered.filter((t) => t.completed);
      switch (filter) {
        case 'pending':
          return { pendingTodos: pending, completedTodos: [] as Todo[] };
        case 'completed':
          return { pendingTodos: [] as Todo[], completedTodos: done };
        default:
          return { pendingTodos: pending, completedTodos: done };
      }
    }, [project.id, todos, filter]);

    const createdLabel = formatChineseDate(project.createdAt);
    const exportedLabel = formatChineseDate(new Date().toISOString());
    const isEmpty = pendingTodos.length === 0 && completedTodos.length === 0;
    const displayedPending =
      maxItems === undefined ? pendingTodos : pendingTodos.slice(0, maxItems);
    const displayedCompleted =
      maxItems === undefined
        ? completedTodos
        : completedTodos.slice(0, Math.max(0, maxItems - displayedPending.length));
    const omittedCount =
      pendingTodos.length +
      completedTodos.length -
      displayedPending.length -
      displayedCompleted.length;

    return (
      <div
        ref={ref}
        style={{
          // 「桌面」底色 —— 卡片浮在它之上，留出投影空间
          width: CARD_WIDTH,
          padding: 28,
          backgroundColor: 'var(--bg-secondary)',
          boxSizing: 'border-box',
          fontFamily: 'var(--font-body)',
        }}
      >
        <div
          style={{
            position: 'relative',
            backgroundColor: 'var(--bg-tertiary)',
            borderRadius: 16,
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--border-color)',
            padding: '32px 28px 24px 34px',
            overflow: 'hidden',
          }}
        >
          {/* 左侧品牌色竖条 —— 卡片分享型的招牌元素 */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 6,
              backgroundColor: 'var(--accent)',
            }}
          />

          {/* 头部：项目名 + 元信息 */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--font-heading)',
                fontSize: 28,
                fontWeight: 700,
                lineHeight: 1.2,
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              {project.name}
            </h1>
          </div>
          <div
            style={{
              marginTop: 6,
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--text-tertiary)',
            }}
          >
            创建于 {createdLabel} · 共 {total} 项
          </div>

          {/* 进度条（统计始终全量） */}
          {total > 0 && <ProgressBar total={total} completed={completedCount} />}

          {/* 任务区 */}
          {isEmpty ? (
            <div
              style={{
                marginTop: 24,
                padding: '20px 0',
                textAlign: 'center',
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                color: 'var(--text-quaternary)',
              }}
            >
              {filter === 'pending'
                ? '暂无未完成事项'
                : filter === 'completed'
                  ? '暂无已完成事项'
                  : '暂无事项'}
            </div>
          ) : (
            <>
              {displayedPending.length > 0 && (
                <>
                  <GroupHeader label="待办" count={pendingCount} />
                  {displayedPending.map((todo) => (
                    <TodoRow key={todo.id} todo={todo} />
                  ))}
                </>
              )}
              {displayedCompleted.length > 0 && (
                <>
                  <GroupHeader label="已完成" count={completedCount} />
                  {displayedCompleted.map((todo) => (
                    <TodoRow key={todo.id} todo={todo} />
                  ))}
                </>
              )}
              {omittedCount > 0 && (
                <div
                  style={{
                    marginTop: 12,
                    padding: '10px 12px',
                    borderRadius: 8,
                    backgroundColor: 'var(--bg-hover)',
                    color: 'var(--text-tertiary)',
                    fontSize: 12.5,
                    textAlign: 'center',
                  }}
                >
                  预览省略其余 {omittedCount} 项，导出图片将包含全部事项
                </div>
              )}
            </>
          )}

          {/* 底部署名 */}
          <div
            style={{
              marginTop: 24,
              paddingTop: 14,
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontFamily: 'var(--font-brand)',
              fontSize: 12,
              color: 'var(--text-quaternary)',
            }}
          >
            <span style={{ fontStyle: 'italic' }}>Celery Todo</span>
            <span>{exportedLabel}</span>
          </div>
        </div>
      </div>
    );
  },
);
