/**
 * @file CountBadge - 计数徽标
 * @description 统一展示数量，并使用主题 token 保持跨主题的一致性。
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/helpers';

type CountBadgeVariant = 'accent' | 'muted';

interface CountBadgeProps {
  children: ReactNode;
  variant?: CountBadgeVariant;
  className?: string;
}

const BACKGROUND_COLORS: Record<CountBadgeVariant, string> = {
  accent: 'var(--accent-subtle)',
  muted: 'var(--bg-hover)',
};

const TEXT_COLORS: Record<CountBadgeVariant, string> = {
  accent: 'var(--accent)',
  muted: 'var(--text-secondary)',
};

export function CountBadge({ children, variant = 'muted', className }: CountBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-none tabular-nums',
        className,
      )}
      style={{ backgroundColor: BACKGROUND_COLORS[variant], color: TEXT_COLORS[variant] }}
    >
      {children}
    </span>
  );
}
