/**
 * @file StickerAddTodo - 贴图（简洁模式）专用的新建待办输入框
 * @description 主窗口 AddTodoInput 的极简版：只保留标题输入（自适应高度、
 * IME 组合输入保护、回车提交、批量添加、按项目缓存草稿）。去掉优先级 /
 * 描述展开 / 卡片样式 —— 贴图视觉语言由 .sticker-add 控制。
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Priority } from '../../types';
import { hasBulkSeparator, splitBulkTitles } from '../../utils/helpers';
import { autosizeTextarea, TEXTAREA_MAX_HEIGHT } from '../../utils/textarea';

interface StickerAddTodoProps {
  /** 提交回调。批量场景返回多个标题；单条返回一个。 */
  onAdd: (titles: string[], priority: Priority) => void;
  /** 当前所属项目 id —— 草稿按项目隔离，切换项目时输入框内容随之切换 */
  projectId: string;
  /** 挂载后自动聚焦 textarea。浮层场景用；body 常驻场景（如有）不传。 */
  autoFocus?: boolean;
}

/** 每个项目各自的输入草稿，切换项目时完整恢复编辑现场 */
interface Draft {
  title: string;
  priority: Priority;
}

const DEFAULT_PRIORITY: Priority = 'medium';

function StickerAddTodoComponent({ onAdd, projectId, autoFocus }: StickerAddTodoProps) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>(DEFAULT_PRIORITY);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // IME 组字状态：组字过程中的 Enter 不应触发添加（中文输入法选词）
  const isComposingRef = useRef(false);
  // 每个项目的草稿缓存（仅内存，重启清空）。key 为 projectId。
  // projectId 为空串（首启 / 项目被删光）时不读写此 Map，避免脏 key。
  const draftsRef = useRef<Record<string, Draft>>({});

  // 切换项目：载入该项目各自的草稿。首次进入某项目时落回空标题 + 默认优先级。
  // projectId 为空串时不参与，避免误写到 '' 这个无意义 key。
  useEffect(() => {
    if (!projectId) return;
    const d = draftsRef.current[projectId];
    setTitle(d?.title ?? '');
    setPriority(d?.priority ?? DEFAULT_PRIORITY);
  }, [projectId]);

  // 文本框自适应高度：单行时与原 input 一致，多行时自动撑高
  const autosize = useCallback(() => {
    autosizeTextarea(textareaRef.current);
  }, []);

  useEffect(() => {
    autosize();
  }, [title, autosize]);

  // 浮层场景：挂载后自动聚焦输入框，便于立即开始输入
  useEffect(() => {
    if (autoFocus) requestAnimationFrame(() => textareaRef.current?.focus());
  }, [autoFocus]);

  // 写入标题并同步到当前项目的草稿缓存
  const handleTitleChange = useCallback(
    (v: string) => {
      setTitle(v);
      if (projectId) {
        draftsRef.current[projectId] = {
          title: v,
          priority: draftsRef.current[projectId]?.priority ?? priority,
        };
      }
    },
    [projectId, priority],
  );

  // 切换优先级并同步草稿
  const handlePriorityChange = useCallback(
    (p: Priority) => {
      setPriority(p);
      if (projectId) {
        draftsRef.current[projectId] = {
          title: draftsRef.current[projectId]?.title ?? title,
          priority: p,
        };
      }
    },
    [projectId, title],
  );

  const handleAdd = useCallback(() => {
    const trimmed = title.trim();
    if (trimmed.length === 0) return;
    const titles = hasBulkSeparator(trimmed) ? splitBulkTitles(trimmed) : [trimmed];
    if (titles.length === 0) return;
    onAdd(titles, priority);

    // 提交后清空标题；优先级保留，方便连续添加。
    setTitle('');
    if (projectId) {
      draftsRef.current[projectId] = { title: '', priority };
    }
    // 提交后重新聚焦输入框，便于连续添加
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [title, priority, onAdd, projectId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== 'Enter' || isComposingRef.current || e.nativeEvent.isComposing) return;
      // 普通 Enter 始终快速提交；Shift+Enter 用于换行（批量输入）。
      if (!e.shiftKey) {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd],
  );

  const hasSeparator = hasBulkSeparator(title);

  return (
    <div className="sticker-add sticker-no-drag">
      <button
        type="button"
        onClick={handleAdd}
        disabled={title.trim().length === 0}
        className="sticker-add-btn"
        aria-label="添加事项"
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 1.5v9M1.5 6h9" />
        </svg>
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
        aria-label="新事项标题"
        placeholder="添加待办…"
        className="sticker-add-title"
        style={{ maxHeight: TEXTAREA_MAX_HEIGHT }}
      />
      {/* 优先级三段切换：默认 medium；点击切到对应优先级，影响本次新建 */}
      <div className="sticker-add-priority" role="group" aria-label="新事项优先级">
        {(['high', 'medium', 'low'] as Priority[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => handlePriorityChange(p)}
            className="sticker-add-priority-dot"
            data-priority={p}
            data-selected={priority === p}
            aria-label={`优先级：${p === 'high' ? '高' : p === 'medium' ? '中' : '低'}`}
            aria-pressed={priority === p}
          />
        ))}
      </div>
      <AnimatePresence>
        {hasSeparator && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="sticker-add-bulk-tag"
          >
            批量
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

export const StickerAddTodo = memo(StickerAddTodoComponent);
