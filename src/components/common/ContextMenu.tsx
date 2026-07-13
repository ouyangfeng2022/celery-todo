/**
 * @file ContextMenu - 右键上下文菜单
 * @description 通用的右键弹出菜单，渲染到 document.body（portal）避免被父级
 *              overflow:hidden 裁切。触发源通常是元素的 onContextMenu，传入
 *              e.clientX/clientY 作为弹出坐标。
 *
 * 设计参照 NotificationPanel / PriorityMenu：framer-motion 动画 + CSS 变量主题，
 * 自动跟随 light/dark。关闭时机：点击外部、Escape、滚动、窗口 resize。
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../utils/helpers';

/** 普通菜单项 */
export interface ContextMenuAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** 分隔线 */
export interface ContextMenuSeparator {
  separator: true;
}

export type ContextMenuItem = ContextMenuAction | ContextMenuSeparator;

interface ContextMenuProps {
  /** 屏幕坐标（clientX/clientY），右键点击位置 */
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  // 实际渲染坐标：默认用传入的点击点，渲染后测量再翻转以避开视口边界
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nextX = x;
    let nextY = y;
    if (x + rect.width > vw) nextX = Math.max(0, x - rect.width);
    if (y + rect.height > vh) nextY = Math.max(0, y - rect.height);
    setPos({ x: nextX, y: nextY });
  }, [x, y]);

  useLayoutEffect(() => {
    // 点击菜单外部关闭（用 mousedown 而非 click，避免先触发其它交互再关菜单）
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // 滚动 / resize 时菜单定位失效，直接关闭（与主流右键菜单一致）
    const handleLayoutChange = () => onClose();

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleLayoutChange);
    window.addEventListener('scroll', handleLayoutChange, true);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleLayoutChange);
      window.removeEventListener('scroll', handleLayoutChange, true);
    };
  }, [onClose]);

  const handleItemClick = (item: ContextMenuAction) => {
    if (item.disabled) return;
    onClose();
    item.onClick();
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, y: 4, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 4, scale: 0.97 }}
        transition={{ duration: 0.13, ease: [0.4, 0, 0.2, 1] }}
        className="fixed z-[60] min-w-[10rem] py-1 rounded-xl"
        style={{
          left: pos.x,
          top: pos.y,
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-lg)',
        }}
        // 菜单自身不响应 contextmenu，避免右键菜单上再右键出新菜单
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((item, idx) =>
          isSeparator(item) ? (
            <div
              key={`sep-${idx}`}
              className="my-1 mx-2 h-px"
              style={{ backgroundColor: 'var(--border-color)' }}
            />
          ) : (
            <MenuRow key={item.label} item={item} onClick={() => handleItemClick(item)}>
              {item.label}
            </MenuRow>
          ),
        )}
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

function MenuRow({
  item,
  onClick,
  children,
}: {
  item: ContextMenuAction;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={item.disabled}
      className={cn(
        'w-full flex items-center px-3 py-1.5 text-sm text-left transition-colors',
        'hover:bg-[var(--bg-hover)]',
        item.disabled && 'opacity-40 cursor-not-allowed hover:bg-transparent',
        item.danger && 'text-[var(--danger)]',
      )}
      style={!item.danger ? { color: 'var(--text-primary)' } : undefined}
    >
      {children}
    </button>
  );
}

function isSeparator(item: ContextMenuItem): item is ContextMenuSeparator {
  return (item as ContextMenuSeparator).separator === true;
}
