/**
 * @file SearchBar - 搜索框组件
 * @description 实时搜索事项标题和描述
 */

import { memo, useRef, useEffect } from 'react';
import { SearchIcon } from '../common/Icons';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  /** 聚焦信号 */
  focusSignal?: number;
}

function SearchBarComponent({ value, onChange, focusSignal }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusSignal !== undefined && focusSignal > 0) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [focusSignal]);

  return (
    <div className="relative flex-1 max-w-md">
      <div
        className="absolute left-3 top-1/2 -translate-y-1/2"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <SearchIcon size={16} />
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="搜索事项..."
        className="w-full pl-9 pr-3 py-2 text-sm rounded-md border-none outline-none"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
        }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-xs"
          style={{
            backgroundColor: 'var(--bg-hover)',
            color: 'var(--text-tertiary)',
          }}
          aria-label="清除搜索"
        >
          ×
        </button>
      )}
    </div>
  );
}

export const SearchBar = memo(SearchBarComponent);
