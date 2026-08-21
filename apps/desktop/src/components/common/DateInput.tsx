/**
 * @file DateInput - 日期输入：中文格式显示 + 原生日期选择器
 * @description 原生 <input type="date"> 的可见文本与占位符随系统 locale 渲染
 *              （日语/英语环境显示 yyyy/mm/dd），与中文界面混排。这里改为自绘
 *              中文文本（「8月21日」），原生控件透明覆盖其上负责弹日历与键盘
 *              输入，value 仍为 YYYY-MM-DD，不影响数据层。
 */

import { useState } from 'react';
import { cn } from '../../utils/helpers';
import { formatPlannedDate } from '../../utils/planning';

interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  /** 无值时的占位文案 */
  placeholder?: string;
  /** chip = 紧凑内联（工具栏）；field = 表单整行（与 .claude-input 视觉对齐） */
  variant?: 'chip' | 'field';
  className?: string;
  'aria-label'?: string;
}

export function DateInput({
  value,
  onChange,
  placeholder = '选择日期',
  variant = 'chip',
  className,
  'aria-label': ariaLabel,
}: DateInputProps) {
  const [focused, setFocused] = useState(false);
  const isField = variant === 'field';

  return (
    <span
      className={cn(
        'relative inline-flex cursor-pointer select-none items-center rounded-md transition-shadow',
        isField ? 'w-full px-3 py-2 text-[0.9375rem]' : 'px-2 py-1 text-xs',
        className,
      )}
      style={{
        backgroundColor: isField ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
        color: value
          ? isField
            ? 'var(--text-primary)'
            : 'var(--text-secondary)'
          : 'var(--text-quaternary)',
        border: isField ? `1px solid ${focused ? 'var(--accent)' : 'var(--border-strong)'}` : undefined,
        boxShadow: focused ? '0 0 0 3px rgba(217, 119, 87, 0.14)' : undefined,
      }}
    >
      {value ? formatPlannedDate(value) : placeholder}
      <input
        type="date"
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onClick={(event) => {
          // 原生日期输入仅右侧日历图标可弹面板；整块点击都直接弹出。
          try {
            event.currentTarget.showPicker();
          } catch {
            // 环境不支持时退回原生聚焦行为
          }
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </span>
  );
}
