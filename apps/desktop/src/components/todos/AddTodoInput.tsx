/**
 * @file AddTodoInput - 添加事项输入框
 * @description 支持回车添加、批量添加（Shift+Enter 换行分隔）、优先级与渐进式描述编辑
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Priority } from '../../types';
import { PRIORITY_LABELS, PRIORITY_SOLID } from '../../types';
import { PlusIcon } from '../common/Icons';
import { DateInput } from '../common/DateInput';
import { hasBulkSeparator } from '../../utils/helpers';
import { useDismissibleLayer } from '../../hooks/useDismissibleLayer';
import { autosizeTextarea, TEXTAREA_MAX_HEIGHT } from '../../utils/textarea';
import { getPlatform } from '../../platform';

/** 每个项目各自的输入草稿，切换项目时完整恢复编辑现场 */
interface Draft {
  title: string;
  priority: Priority;
  description: string;
  isDescriptionOpen: boolean;
  plannedDate: string;
}

interface AddTodoInputProps {
  onAdd: (title: string, priority: Priority, description?: string, plannedDate?: string) => void;
  /** 当前所属项目 id —— 草稿按项目隔离，切换项目时输入框内容随之切换 */
  projectId: string;
  /** 是否聚焦（由快捷键触发） */
  focusSignal?: number;
  /** 时间视图可用分类日期预填；项目草稿仍会独立记忆用户修改。 */
  defaultPlannedDate?: string;
}

function AddTodoInputComponent({
  onAdd,
  projectId,
  focusSignal,
  defaultPlannedDate,
}: AddTodoInputProps) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [description, setDescription] = useState('');
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [plannedDate, setPlannedDate] = useState(defaultPlannedDate ?? '');
  const [showOptions, setShowOptions] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // IME 组字状态：组字过程中的 Enter 不应触发添加（中文输入法选词）
  const isComposingRef = useRef(false);
  // 每个项目的草稿缓存（仅内存，重启清空）。key 为 projectId。
  // projectId 为空串（首启 / 项目被删光）时不读写此 Map，避免脏 key。
  const draftsRef = useRef<Record<string, Draft>>({});

  // 快捷键聚焦
  useEffect(() => {
    if (focusSignal !== undefined && focusSignal > 0) {
      textareaRef.current?.focus();
    }
  }, [focusSignal]);

  // 切换项目：载入该项目各自的草稿。首次进入某项目时落回空标题 + 默认优先级。
  // 这里只负责"载入"——保存由 handleTitleChange / handlePriorityChange 在输入时同步写入，
  // 提交清空也走 handleTitleChange，避免 effect 时序复杂。
  // projectId 为空串（首启未选定 / 删光项目）时不参与，避免误写到 '' 这个无意义 key。
  useEffect(() => {
    if (!projectId) return;
    const d = draftsRef.current[projectId];
    setTitle(d?.title ?? '');
    setPriority(d?.priority ?? 'medium');
    setDescription(d?.description ?? '');
    setIsDescriptionOpen(d?.isDescriptionOpen ?? false);
    setPlannedDate(d?.plannedDate ?? defaultPlannedDate ?? '');
  }, [projectId, defaultPlannedDate]);

  // 文本框自适应高度：单行时与原 input 一致，多行时自动撑高
  const autosize = useCallback(() => {
    autosizeTextarea(textareaRef.current);
  }, []);

  useEffect(() => {
    autosize();
  }, [title, autosize]);

  // 描述框同样自适应：内容少时贴合行数，超过最大高度后改为内部滚动
  useEffect(() => {
    autosizeTextarea(descriptionRef.current);
  }, [description]);

  // 点击外部或按 Escape 收起扩展选项。
  useDismissibleLayer(showOptions, [wrapRef], () => setShowOptions(false));

  // 写入标题并同步到当前项目的草稿缓存
  const handleTitleChange = useCallback(
    (v: string) => {
      setTitle(v);
      if (projectId) {
        const prev = draftsRef.current[projectId];
        draftsRef.current[projectId] = {
          title: v,
          priority: prev?.priority ?? priority,
          description: prev?.description ?? description,
          isDescriptionOpen: prev?.isDescriptionOpen ?? isDescriptionOpen,
          plannedDate: prev?.plannedDate ?? plannedDate,
        };
      }
    },
    [projectId, priority, description, isDescriptionOpen, plannedDate],
  );

  // 写入优先级并同步到当前项目的草稿缓存
  const handlePriorityChange = useCallback(
    (p: Priority) => {
      setPriority(p);
      if (projectId) {
        const prev = draftsRef.current[projectId];
        draftsRef.current[projectId] = {
          title: prev?.title ?? title,
          priority: p,
          description: prev?.description ?? description,
          isDescriptionOpen: prev?.isDescriptionOpen ?? isDescriptionOpen,
          plannedDate: prev?.plannedDate ?? plannedDate,
        };
      }
    },
    [projectId, title, description, isDescriptionOpen, plannedDate],
  );

  // 写入描述并同步到当前项目草稿
  const handleDescriptionChange = useCallback(
    (v: string) => {
      setDescription(v);
      if (projectId) {
        const prev = draftsRef.current[projectId];
        draftsRef.current[projectId] = {
          title: prev?.title ?? title,
          priority: prev?.priority ?? priority,
          description: v,
          isDescriptionOpen: prev?.isDescriptionOpen ?? isDescriptionOpen,
          plannedDate: prev?.plannedDate ?? plannedDate,
        };
      }
    },
    [projectId, title, priority, isDescriptionOpen, plannedDate],
  );

  // 展开状态也写入项目草稿，切换项目后可恢复到原编辑现场
  const handleDescriptionOpenChange = useCallback(
    (open: boolean) => {
      setIsDescriptionOpen(open);
      if (projectId) {
        const prev = draftsRef.current[projectId];
        draftsRef.current[projectId] = {
          title: prev?.title ?? title,
          priority: prev?.priority ?? priority,
          description: prev?.description ?? description,
          isDescriptionOpen: open,
          plannedDate: prev?.plannedDate ?? plannedDate,
        };
      }
    },
    [projectId, title, priority, description, plannedDate],
  );

  const handlePlannedDateChange = useCallback(
    (value: string) => {
      setPlannedDate(value);
      if (projectId) {
        const prev = draftsRef.current[projectId];
        draftsRef.current[projectId] = {
          title: prev?.title ?? title,
          priority: prev?.priority ?? priority,
          description: prev?.description ?? description,
          isDescriptionOpen: prev?.isDescriptionOpen ?? isDescriptionOpen,
          plannedDate: value,
        };
      }
    },
    [description, isDescriptionOpen, priority, projectId, title],
  );

  const handleAdd = useCallback(() => {
    const trimmed = title.trim();
    if (trimmed.length === 0) return;
    // 批量模式不携带统一描述；详情模式从交互上已禁止标题进入多行。
    const nextDescription = hasBulkSeparator(trimmed) ? undefined : description.trim() || undefined;
    onAdd(trimmed, priority, nextDescription, plannedDate || undefined);

    // 提交后清空标题与描述、收起详情；优先级保留，方便连续添加。
    setTitle('');
    setDescription('');
    setIsDescriptionOpen(false);
    if (projectId) {
      draftsRef.current[projectId] = {
        title: '',
        priority,
        description: '',
        isDescriptionOpen: false,
        plannedDate,
      };
    }
  }, [title, priority, description, plannedDate, onAdd, projectId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== 'Enter' || isComposingRef.current || e.nativeEvent.isComposing) return;

      if (isDescriptionOpen && e.shiftKey) {
        // 详情模式固定为单事项，Shift+Enter 用作从标题进入描述的快捷路径。
        e.preventDefault();
        descriptionRef.current?.focus();
      } else if (!e.shiftKey) {
        // 普通 Enter 始终快速提交；未展开详情时 Shift+Enter 仍用于批量输入。
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd, isDescriptionOpen],
  );

  // 检测是否包含分隔符（仅换行触发批量，逗号/分号视为普通字符）
  const hasSeparator = hasBulkSeparator(title);
  const hasDescription = description.trim().length > 0;
  const isMac = getPlatform() === 'darwin';

  const handleToggleDescription = useCallback(() => {
    if (hasSeparator) return;
    const nextOpen = !isDescriptionOpen;
    handleDescriptionOpenChange(nextOpen);
    if (nextOpen) {
      requestAnimationFrame(() => descriptionRef.current?.focus());
    } else {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [hasSeparator, isDescriptionOpen, handleDescriptionOpenChange]);

  const handleDescriptionKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        e.key === 'Enter' &&
        (e.metaKey || e.ctrlKey) &&
        !isComposingRef.current &&
        !e.nativeEvent.isComposing
      ) {
        e.preventDefault();
        handleAdd();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleDescriptionOpenChange(false);
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    },
    [handleAdd, handleDescriptionOpenChange],
  );

  return (
    <div
      ref={wrapRef}
      className="claude-card transition-all"
      style={{
        padding: '0.625rem 0.875rem',
        boxShadow: isFocused ? '0 0 0 3px rgba(217, 119, 87, 0.10)' : 'var(--shadow-xs)',
        borderColor: isFocused ? 'var(--accent)' : 'var(--border-color)',
      }}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={handleAdd}
          disabled={title.trim().length === 0}
          className="flex-shrink-0 w-7 h-7 mt-px rounded-full flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'white',
            boxShadow: title.trim() ? '0 2px 6px -1px rgba(217, 119, 87, 0.4)' : 'none',
          }}
          aria-label="添加事项"
        >
          <PlusIcon size={16} />
        </button>

        <textarea
          ref={textareaRef}
          value={title}
          rows={1}
          onChange={(e) => handleTitleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          onFocus={() => {
            setShowOptions(true);
            setIsFocused(true);
          }}
          onBlur={() => setIsFocused(false)}
          aria-label="新事项标题"
          placeholder="添加待办事项…"
          className="flex-1 bg-transparent border-none outline-none text-base resize-none overflow-y-auto leading-6"
          style={{
            color: 'var(--text-primary)',
            minHeight: '1.5rem',
            // 上限 8 行（行高 1.5rem × 8）。超过后 textarea 自身滚动，避免撑高整个表单，
            // 也避免之前用 overflow-hidden 导致前几行被永久截断看不到。
            maxHeight: TEXTAREA_MAX_HEIGHT,
          }}
        />

        {hasSeparator && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="claude-tag flex-shrink-0 mt-0.5"
            style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent)' }}
          >
            批量添加
          </motion.span>
        )}
      </div>

      {/* 扩展选项 */}
      <AnimatePresence initial={false}>
        {showOptions && (
          <motion.div
            key="options"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
              opacity: { duration: 0.18, ease: 'easeOut' },
            }}
            style={{ overflow: 'hidden' }}
          >
            <div
              className="flex flex-wrap items-center justify-between gap-2 mt-2.5 pt-2.5 border-t"
              style={{ borderColor: 'var(--border-color)' }}
            >
              {/* 优先级选择 - segmented control 风格 */}
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  优先级
                </span>
                <div
                  className="flex gap-0.5 p-0.5 rounded-md"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  {(['high', 'medium', 'low'] as Priority[]).map((p) => {
                    const selected = priority === p;
                    return (
                      <button
                        key={p}
                        onClick={() => handlePriorityChange(p)}
                        className="px-2 py-0.5 rounded text-xs font-semibold transition-all"
                        style={{
                          backgroundColor: selected ? `${PRIORITY_SOLID[p]}1f` : 'transparent',
                          color: selected ? PRIORITY_SOLID[p] : 'var(--text-tertiary)',
                          boxShadow: selected ? `inset 0 0 0 1px ${PRIORITY_SOLID[p]}40` : 'none',
                        }}
                      >
                        {PRIORITY_LABELS[p]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label
                className="flex items-center gap-2 text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                计划日期
                <DateInput
                  value={plannedDate}
                  onChange={handlePlannedDateChange}
                  aria-label="计划日期"
                />
                {plannedDate && (
                  <button
                    type="button"
                    onClick={() => handlePlannedDateChange('')}
                    className="rounded px-1.5 py-1 hover:bg-[var(--bg-hover)]"
                  >
                    清除
                  </button>
                )}
              </label>

              <button
                type="button"
                onClick={handleToggleDescription}
                disabled={hasSeparator}
                aria-expanded={isDescriptionOpen}
                aria-controls="new-todo-description"
                title={hasSeparator ? '批量添加不支持统一描述' : undefined}
                className="inline-flex items-center gap-1 text-xs font-medium transition-colors disabled:cursor-not-allowed"
                style={{
                  color:
                    isDescriptionOpen || hasDescription
                      ? 'var(--accent)'
                      : hasSeparator
                        ? 'var(--text-quaternary)'
                        : 'var(--text-secondary)',
                }}
              >
                {!isDescriptionOpen && !hasDescription && !hasSeparator && (
                  <span aria-hidden="true">＋</span>
                )}
                {hasSeparator
                  ? '批量添加不支持描述'
                  : isDescriptionOpen || hasDescription
                    ? '已添加描述'
                    : '添加描述'}
              </button>
            </div>

            <AnimatePresence initial={false}>
              {isDescriptionOpen && (
                <motion.div
                  id="new-todo-description"
                  key="description"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    height: { duration: 0.22, ease: [0.4, 0, 0.2, 1] },
                    opacity: { duration: 0.16, ease: 'easeOut' },
                  }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="pt-2.5">
                    <textarea
                      ref={descriptionRef}
                      value={description}
                      rows={3}
                      onChange={(e) => handleDescriptionChange(e.target.value)}
                      onKeyDown={handleDescriptionKeyDown}
                      onCompositionStart={() => {
                        isComposingRef.current = true;
                      }}
                      onCompositionEnd={() => {
                        isComposingRef.current = false;
                      }}
                      aria-label="新事项描述"
                      placeholder="添加描述…"
                      className="claude-input resize-none overflow-y-auto text-sm leading-6"
                      style={{ minHeight: '5.5rem', maxHeight: TEXTAREA_MAX_HEIGHT }}
                    />
                    <div
                      className="mt-1.5 flex justify-end text-[11px]"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      <span>{isMac ? '⌘+Enter' : 'Ctrl+Enter'} 创建</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const AddTodoInput = memo(AddTodoInputComponent);
