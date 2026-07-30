/**
 * @file SearchBar - 搜索框组件
 * @description 实时搜索事项标题和描述
 */

import { memo, useRef, useEffect, useState, useId } from 'react';
import { SearchIcon, XIcon } from '../common/Icons';
import type { GlobalSearchResult } from '../../types';
import { PRIORITY_LABELS } from '../../types';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  results?: GlobalSearchResult[];
  onSelectResult?: (result: GlobalSearchResult) => void;
  /** 聚焦信号 */
  focusSignal?: number;
}

function SearchBarComponent({
  value,
  onChange,
  results = [],
  onSelectResult,
  focusSignal,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // SSR 安全的唯一 id：listbox / options 的 aria 绑定需要稳定且全局唯一。
  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-opt-${index}`;
  // 下拉仅在输入了内容时展示；listbox 是否展开以输入框聚焦 + 有候选为准。
  const showDropdown = !!value.trim();
  const listboxOpen = showDropdown && isFocused && results.length > 0;

  useEffect(() => {
    if (focusSignal !== undefined && focusSignal > 0) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [focusSignal]);

  useEffect(() => setActiveIndex(0), [value, results.length]);

  const selectResult = (result: GlobalSearchResult | undefined) => {
    if (result) onSelectResult?.(result);
  };

  return (
    <div
      // 与 AddTodoInput 一致的卡片底色 + 聚焦 accent 光晕,统一输入控件视觉语言
      className="claude-card relative w-full transition-all"
      style={{
        padding: '0.375rem 0.75rem',
        boxShadow: isFocused ? '0 0 0 3px rgba(217, 119, 87, 0.10)' : 'var(--shadow-xs)',
        borderColor: isFocused ? 'var(--accent)' : 'var(--border-color)',
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="pointer-events-none flex-shrink-0"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <SearchIcon size={15} />
        </div>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={listboxOpen}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={listboxOpen ? optionId(activeIndex) : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && results.length) {
              event.preventDefault();
              setActiveIndex((index) => (index + 1) % results.length);
            }
            if (event.key === 'ArrowUp' && results.length) {
              event.preventDefault();
              setActiveIndex((index) => (index - 1 + results.length) % results.length);
            }
            if (event.key === 'Enter' && results.length) {
              event.preventDefault();
              selectResult(results[activeIndex]);
            }
          }}
          placeholder="搜索所有项目中的事项..."
          aria-label="搜索所有项目中的事项"
          className="flex-1 bg-transparent border-none outline-none text-sm"
          style={{ color: 'var(--text-primary)' }}
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-colors"
            style={{
              backgroundColor: 'var(--bg-hover)',
              color: 'var(--text-tertiary)',
            }}
            aria-label="清除搜索"
          >
            <XIcon size={12} />
          </button>
        )}
      </div>
      {showDropdown && (
        <div className="mt-2 border-t pt-1.5" style={{ borderColor: 'var(--border-color)' }}>
          {results.length ? (
            <div
              id={listboxId}
              role="listbox"
              aria-label="全局搜索结果"
              className="max-h-72 overflow-y-auto"
            >
              {results.map((result, index) => (
                <button
                  key={result.todo.id}
                  id={optionId(index)}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectResult(result)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors"
                  style={{
                    backgroundColor: index === activeIndex ? 'var(--bg-hover)' : undefined,
                    color: 'var(--text-primary)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: result.project.color ?? 'var(--accent)' }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <span
                        className={result.todo.completed ? 'line-through opacity-60' : undefined}
                      >
                        {result.todo.title}
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                        {PRIORITY_LABELS[result.todo.priority]}
                      </span>
                    </span>
                    {result.matchedText && (
                      <span
                        className="mt-0.5 block truncate text-xs"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {result.matchedText}
                      </span>
                    )}
                    <span
                      className="mt-1 block truncate text-[11px]"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {result.project.name}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="px-2 py-3 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
              未找到匹配事项
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export const SearchBar = memo(SearchBarComponent);
