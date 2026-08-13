/**
 * @file TodoDetailDialog - 事项详情浮窗
 * @description 点击 todo 标题后弹出，承担标题/描述/优先级/计划日期/所属项目的
 *              完整编辑能力。Markdown 渲染器仅在描述切到「预览」tab 时懒加载，
 *              避免首次进入浮窗就拉取 react-markdown / KaTeX chunk。
 *
 * 实现要点：
 * - 标题/描述本地草稿 + 600ms debounce 提交；关闭/归档前强制 flush，避免丢失输入。
 * - 优先级 / 日期 / 项目走 change 即提交（与列表内行为一致）。
 * - 关闭来源：右上 X 按钮、遮罩点击、Esc 键 —— 三者都经 handleClose 以触发 flush。
 */

import { memo, useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTodoStore } from '../../store/useTodoStore';
import { useDismissibleLayer } from '../../hooks/useDismissibleLayer';
import { autosizeTextarea, TEXTAREA_MAX_HEIGHT } from '../../utils/textarea';
import { cn } from '../../utils/helpers';
import { PRIORITY_LABELS, PRIORITY_SOLID } from '../../types';
import type { Priority } from '../../types';
import { CheckIcon, ArchiveIcon, PinIcon, CalendarIcon, XIcon } from '../common/Icons';

// Markdown/GFM/KaTeX 仅在浮窗切到「预览」tab 时加载。
const MarkdownContent = lazy(() =>
  import('../common/MarkdownContent').then((module) => ({ default: module.MarkdownContent })),
);

/** 标题/描述编辑的 debounce 提交间隔 */
const SAVE_DEBOUNCE_MS = 600;

function TodoDetailDialogComponent() {
  // 直接从 todos 数组派生当前 todo；detailTodoId 为 null 或 id 失效时返回 null
  const todo = useTodoStore((s) =>
    s.detailTodoId ? (s.todos.find((t) => t.id === s.detailTodoId) ?? null) : null,
  );
  const updateTodo = useTodoStore((s) => s.updateTodo);
  const toggleTodo = useTodoStore((s) => s.toggleTodo);
  const deleteTodo = useTodoStore((s) => s.deleteTodo);
  const closeDetail = useTodoStore((s) => s.closeDetail);

  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  // debounce timer；关闭/卸载时清理，避免回调到已卸载组件或泄漏
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 标题/描述本地草稿；todo.id 变化时由下面 useEffect 同步重置。
  // 用 ref 镜像最新值，让 setTimeout 回调和「关闭时 flush」读到最新草稿，
  // 而不必把 draft 放进回调依赖（否则每次输入都重建 timer 与回调）。
  const [titleDraft, setTitleDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const titleDraftRef = useRef('');
  const descDraftRef = useRef('');
  titleDraftRef.current = titleDraft;
  descDraftRef.current = descDraft;

  // 上次已写入 store 的草稿快照，用于「无变化时跳过写库」与「标题为空回退」
  const lastSavedRef = useRef<{ title: string; desc: string }>({ title: '', desc: '' });
  // 当前打开的 todo.id；用于在 todo 引用变化（其他字段更新）时跳过草稿重置
  const openedIdRef = useRef<string | null>(null);

  const [descMode, setDescMode] = useState<'edit' | 'preview'>('preview');
  const [isSaving, setIsSaving] = useState(false);

  // 浮窗打开/切换 todo 时：同步草稿、重置 lastSaved、autosize textarea。
  // 只依赖 todo 引用本身，但通过 openedIdRef 区分「id 变化」vs「同 id 的字段更新」，
  // 避免编辑过程中 updateTodo 触发 todos 引用变化反过来重置草稿。
  useEffect(() => {
    if (!todo) {
      openedIdRef.current = null;
      return;
    }
    if (openedIdRef.current === todo.id) return;
    openedIdRef.current = todo.id;
    const initialDesc = todo.description ?? '';
    setTitleDraft(todo.title);
    setDescDraft(initialDesc);
    titleDraftRef.current = todo.title;
    descDraftRef.current = initialDesc;
    lastSavedRef.current = { title: todo.title, desc: initialDesc };
    setDescMode('preview');
    setIsSaving(false);
    const raf = requestAnimationFrame(() => {
      autosizeTextarea(titleRef.current);
      autosizeTextarea(descRef.current);
    });
    return () => cancelAnimationFrame(raf);
  }, [todo]);

  // 卸载时清理 debounce timer（不在这里 flush —— 关闭流程已显式 flush）
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  // 立即把当前草稿写入 store（无变化时跳过；标题为空时回退原值）
  const flushNow = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const id = openedIdRef.current;
    if (!id) return;
    const title = titleDraftRef.current.trim();
    const desc = descDraftRef.current.trim();
    if (title === lastSavedRef.current.title && desc === lastSavedRef.current.desc) return;
    if (title.length === 0) {
      // 标题不允许为空：回退到上次保存值
      setTitleDraft(lastSavedRef.current.title);
      titleDraftRef.current = lastSavedRef.current.title;
      return;
    }
    void updateTodo(id, { title, description: desc || undefined });
    lastSavedRef.current = { title, desc };
  }, [updateTodo]);

  // 调度 debounce 保存：输入过程中显示「保存中」，600ms 后写入
  const scheduleSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setIsSaving(true);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      flushNow();
      setIsSaving(false);
    }, SAVE_DEBOUNCE_MS);
  }, [flushNow]);

  const handleTitleChange = useCallback(
    (value: string) => {
      setTitleDraft(value);
      scheduleSave();
      requestAnimationFrame(() => autosizeTextarea(titleRef.current));
    },
    [scheduleSave],
  );

  const handleDescChange = useCallback(
    (value: string) => {
      setDescDraft(value);
      scheduleSave();
      requestAnimationFrame(() => autosizeTextarea(descRef.current));
    },
    [scheduleSave],
  );

  const handleClose = useCallback(() => {
    // 关闭前强制 flush 未提交草稿，防止丢输入
    flushNow();
    setIsSaving(false);
    closeDetail();
  }, [flushNow, closeDetail]);

  const handleArchive = useCallback(() => {
    if (!openedIdRef.current) return;
    flushNow();
    void deleteTodo(openedIdRef.current);
    closeDetail();
  }, [flushNow, deleteTodo, closeDetail]);

  // 外部点击 / Esc 关闭 —— 经 handleClose 以触发 flush
  useDismissibleLayer(!!todo, [dialogRef], handleClose);

  return (
    <AnimatePresence>
      {todo && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* 遮罩 */}
          <div
            className="absolute inset-0 backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(47, 45, 39, 0.4)' }}
            onClick={handleClose}
          />

          {/* 详情卡片 */}
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="事项详情"
            className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-lg)',
            }}
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* 顶部栏：完成切换 / 保存状态 / 关闭 */}
            <div
              className="flex flex-shrink-0 items-center justify-between gap-3 border-b px-5 py-3"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <button
                type="button"
                onClick={() => toggleTodo(todo.id)}
                className="flex min-h-8 items-center gap-2 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                <span
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded-full border-[1.5px] transition-all',
                    todo.completed
                      ? 'border-[var(--accent)] bg-[var(--accent)]'
                      : 'border-[var(--border-strong)] hover:border-[var(--accent)]',
                  )}
                >
                  {todo.completed && <CheckIcon size={10} className="text-white" />}
                </span>
                {todo.completed ? '已完成' : '标记完成'}
              </button>

              <span
                className="ml-auto flex items-center gap-1.5 text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
                aria-live="polite"
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full transition-colors',
                    isSaving && 'animate-pulse',
                  )}
                  style={{
                    backgroundColor: isSaving ? 'var(--accent)' : 'var(--text-tertiary)',
                  }}
                />
                {isSaving ? '保存中…' : '已保存'}
              </span>

              <button
                type="button"
                onClick={handleClose}
                aria-label="关闭"
                className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <XIcon size={16} />
              </button>
            </div>

            {/* 可滚动内容区 */}
            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
              <div className="mx-auto grid max-w-[50rem] gap-6">
                {/* 标题 + 元数据工具栏：优先级 / 计划日期 / 置顶 / 归档
                 * 集中在标题正下方，方便快速操作；不再单独设底部动作栏或属性卡片。 */}
                <div className="border-b pb-4" style={{ borderColor: 'var(--border-color)' }}>
                  <textarea
                    ref={titleRef}
                    value={titleDraft}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="事项标题"
                    aria-label="事项标题"
                    rows={1}
                    className="w-full resize-none overflow-hidden bg-transparent text-2xl font-semibold leading-snug outline-none sm:text-3xl"
                    style={{
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-heading)',
                      maxHeight: TEXTAREA_MAX_HEIGHT,
                    }}
                  />

                  {/* 元数据工具栏：窄窗自动换行 */}
                  <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2">
                    {/* 优先级分段控件 */}
                    <div className="flex items-center gap-1.5">
                      <span className="claude-eyebrow">优先级</span>
                      <div
                        className="flex gap-0.5 rounded-md p-0.5"
                        style={{ backgroundColor: 'var(--bg-secondary)' }}
                      >
                        {(['high', 'medium', 'low'] as Priority[]).map((p) => {
                          const selected = todo.priority === p;
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => updateTodo(todo.id, { priority: p })}
                              className="rounded px-2 py-0.5 text-xs font-semibold transition-all"
                              style={{
                                backgroundColor: selected ? `${PRIORITY_SOLID[p]}1f` : 'transparent',
                                color: selected ? PRIORITY_SOLID[p] : 'var(--text-tertiary)',
                                boxShadow: selected
                                  ? `inset 0 0 0 1px ${PRIORITY_SOLID[p]}40`
                                  : 'none',
                              }}
                            >
                              {PRIORITY_LABELS[p]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 计划日期 */}
                    <label
                      className="flex items-center gap-1.5 text-xs"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      <CalendarIcon size={13} />
                      <input
                        type="date"
                        value={todo.plannedDate ?? ''}
                        onChange={(e) =>
                          updateTodo(todo.id, { plannedDate: e.target.value || undefined })
                        }
                        className="min-w-0 rounded-md border-none px-1.5 py-0.5 text-xs"
                        style={{
                          backgroundColor: 'var(--bg-secondary)',
                          color: 'var(--text-secondary)',
                        }}
                      />
                      {todo.plannedDate && (
                        <button
                          type="button"
                          onClick={() => updateTodo(todo.id, { plannedDate: undefined })}
                          className="rounded px-1 py-0.5 text-xs transition-colors hover:bg-[var(--bg-hover)]"
                          aria-label="清除计划日期"
                        >
                          ×
                        </button>
                      )}
                    </label>

                    {/* 右侧动作：置顶 / 归档 */}
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateTodo(todo.id, { pinned: !todo.pinned })}
                        className={cn(
                          'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)]',
                          todo.pinned ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]',
                        )}
                      >
                        <PinIcon size={13} />
                        {todo.pinned ? '已置顶' : '置顶'}
                      </button>
                      <button
                        type="button"
                        onClick={handleArchive}
                        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--danger)]"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <ArchiveIcon size={13} />
                        归档
                      </button>
                    </div>
                  </div>
                </div>

                {/* 描述：编辑是工作区主体，预览保留相同的纸面层级。 */}
                <section aria-labelledby="todo-detail-description-heading" className="grid gap-2.5">
                  <div className="flex items-center gap-1">
                    <span
                      id="todo-detail-description-heading"
                      className="mr-auto font-serif text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      描述
                    </span>
                    <button
                      type="button"
                      onClick={() => setDescMode('edit')}
                      className={cn(
                        'rounded px-2 py-0.5 text-xs transition-colors',
                        descMode === 'edit'
                          ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                          : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]',
                      )}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => setDescMode('preview')}
                      className={cn(
                        'rounded px-2 py-0.5 text-xs transition-colors',
                        descMode === 'preview'
                          ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                          : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]',
                      )}
                    >
                      预览
                    </button>
                    <span className="ml-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                      支持 Markdown
                    </span>
                  </div>
                  {descMode === 'edit' ? (
                    <textarea
                      ref={descRef}
                      value={descDraft}
                      onChange={(e) => handleDescChange(e.target.value)}
                      placeholder="添加描述…"
                      aria-label="事项描述"
                      rows={4}
                      className="claude-input w-full resize-none overflow-y-auto text-[0.9375rem] leading-relaxed"
                      style={{ minHeight: '7.5rem', maxHeight: TEXTAREA_MAX_HEIGHT }}
                    />
                  ) : (
                    <div
                      className="markdown-body min-h-[7.5rem] rounded-lg border px-4 py-3 text-[0.9375rem]"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {descDraft.trim() ? (
                        <Suspense fallback={<span>{descDraft}</span>}>
                          <MarkdownContent content={descDraft} />
                        </Suspense>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>暂无描述</span>
                      )}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const TodoDetailDialog = memo(TodoDetailDialogComponent);
