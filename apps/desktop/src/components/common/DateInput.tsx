/**
 * @file DateInput - 日期输入：中文格式显示 + 原生日期选择器
 * @description 原生 <input type="date"> 的可见文本与占位符随系统 locale 渲染
 *              （日语/英语环境显示 yyyy/mm/dd），与中文界面混排。这里改为自绘
 *              中文文本（「8月21日」），原生控件透明覆盖其上负责弹日历与键盘
 *              输入，value 仍为 YYYY-MM-DD，不影响数据层。
 *              视觉集中在 globals.css 的 .date-input（chip / field 两变体），
 *              hover 与焦点态走 CSS 伪类，无需 JS 状态。
 */

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
  return (
    <span
      className={cn(
        'date-input',
        variant === 'field' ? 'date-input--field' : 'date-input--chip',
        !value && 'is-empty',
        className,
      )}
    >
      {value ? formatPlannedDate(value) : placeholder}
      <input
        type="date"
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
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
