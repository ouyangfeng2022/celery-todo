/**
 * @file Logo - 应用品牌图
 * @description 使用 assets 中的 Celery Todo 品牌图。默认显示无文字图标，
 *              可按需切换到底部带文字的完整版本。
 */

import { memo } from 'react';
import celeryFullLogoUrl from '../../../assets/celery-todo.svg';
import celeryMarkLogoUrl from '../../../assets/celery-todo-no-text.svg';
import lightFullLogoUrl from '../../../assets/celery-todo-light.svg';
import lightMarkLogoUrl from '../../../assets/celery-todo-no-text-light.svg';

interface LogoProps {
  /** 渲染尺寸（px），同时设置 width / height */
  size?: number;
  /** 额外类名 */
  className?: string;
  /** 题目（无障碍） */
  title?: string;
  /** 是否显示底部品牌文字 */
  variant?: 'mark' | 'full';
}

/** 默认使用紧凑图标，以适配侧栏、设置等小尺寸场景；加载页使用完整版本。 */
function LogoComponent({ size, className, title = 'Celery Todo', variant = 'mark' }: LogoProps) {
  const lightLogoUrl = variant === 'full' ? lightFullLogoUrl : lightMarkLogoUrl;
  const celeryLogoUrl = variant === 'full' ? celeryFullLogoUrl : celeryMarkLogoUrl;

  return (
    <span
      className={`app-logo relative inline-flex ${className ?? ''}`}
      style={{ width: size ?? '100%', height: size ?? '100%' }}
      role="img"
      aria-label={title}
    >
      <img
        src={lightLogoUrl}
        alt=""
        className="app-logo-light h-full w-full object-contain"
        draggable={false}
      />
      <img
        src={celeryLogoUrl}
        alt=""
        className="app-logo-celery absolute inset-0 h-full w-full object-contain"
        draggable={false}
      />
    </span>
  );
}

export const Logo = memo(LogoComponent);
