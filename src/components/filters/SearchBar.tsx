/**
 * @file SearchBar - 搜索框组件
 * @description 实时搜索事项标题和描述
 */

import { memo, useRef, useEffect, useState } from 'react';
import { SearchIcon, XIcon } from '../common/Icons';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  /** 聚焦信号 */
  focusSignal?: number;
}

function SearchBarComponent({ value, onChange, focusSignal }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (focusSignal !== undefined && focusSignal > 0) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [focusSignal]);

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
        <div className="pointer-events-none flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
          <SearchIcon size={15} />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="搜索事项..."
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
    </div>
  );
}

export const SearchBar = memo(SearchBarComponent);
