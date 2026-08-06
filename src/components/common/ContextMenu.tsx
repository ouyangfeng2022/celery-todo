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
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /**
   * 子菜单：存在则该项作为父级，hover/click 时在其右侧展开。
   * 父项自身的 onClick 通常留空（点击父项只展开子菜单，不触发其它动作）。
   */
  submenu?: ContextMenuItem[];
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
  // 当前展开的子菜单：记录父项 id（用 label 作 key）+ 父行 rect，用于定位
  const [openSubmenu, setOpenSubmenu] = useState<{ key: string; rowRect: DOMRect } | null>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  // 子菜单实际渲染坐标：测量后做视口翻转
  const [submenuPos, setSubmenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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

  // 子菜单定位：默认贴在父行右侧、顶端对齐；右侧放不下则翻到左侧，下方溢出则上移
  useLayoutEffect(() => {
    if (!openSubmenu) return;
    const el = submenuRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const row = openSubmenu.rowRect;
    // 默认在父行右侧
    let nextX = row.right;
    let nextY = row.top;
    // 右侧放不下 → 翻到父行左侧
    if (nextX + r.width > vw) nextX = Math.max(0, row.left - r.width);
    // 下方溢出 → 上移，保证底部不超出视口（顶部不低于 0）
    if (nextY + r.height > vh) nextY = Math.max(0, vh - r.height - 4);
    setSubmenuPos({ x: nextX, y: nextY });
  }, [openSubmenu]);

  useLayoutEffect(() => {
    // 点击菜单外部关闭（用 mousedown 而非 click，避免先触发其它交互再关菜单）。
    // 子菜单是独立 portal，需把 submenuRef 一并视为「菜单内部」，否则点子菜单会被父级判作外部。
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const inMain = menuRef.current?.contains(target);
      const inSub = submenuRef.current?.contains(target);
      if (!inMain && !inSub) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 优先收起子菜单，再按一次才关主菜单（标准级联菜单行为）
        if (openSubmenu) setOpenSubmenu(null);
        else onClose();
      }
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
  }, [onClose, openSubmenu]);

  const handleItemClick = (item: ContextMenuAction) => {
    if (item.disabled) return;
    // 有子菜单的父项：点击只展开子菜单，不执行 onClick、不关闭
    if (item.submenu) {
      return;
    }
    onClose();
    item.onClick?.();
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="ctx-menu-main"
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
            <MenuRow
              key={item.label}
              item={item}
              hasSubmenu={!!item.submenu}
              isSubmenuOpen={openSubmenu?.key === item.label}
              onClick={() => handleItemClick(item)}
              onHover={(rect) => {
                // hover 任意项都回报：有子菜单的父项展开并重定位；
                // hover 普通项（无 submenu）则收起当前子菜单，避免子菜单悬空不关。
                if (item.submenu) {
                  setOpenSubmenu({ key: item.label, rowRect: rect })
                } else {
                  setOpenSubmenu(null)
                }
              }}
            >
              {item.label}
            </MenuRow>
          ),
        )}
      </motion.div>

      {/* 子菜单：独立 portal，但纳入父菜单的「外部点击」判断 */}
      {openSubmenu && (
        <AnimatePresence key="ctx-menu-sub">
          <motion.div
            ref={submenuRef}
            initial={{ opacity: 0, x: -4, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -4, scale: 0.97 }}
            transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
            className="fixed z-[61] min-w-[8rem] py-1 rounded-xl"
            style={{
              left: submenuPos.x,
              top: submenuPos.y,
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-lg)',
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {items
              .filter(
                (it): it is ContextMenuAction =>
                  !isSeparator(it) && it.label === openSubmenu.key,
              )[0]
              ?.submenu?.map((sub, sIdx) =>
                isSeparator(sub) ? (
                  <div
                    key={`sub-sep-${sIdx}`}
                    className="my-1 mx-2 h-px"
                    style={{ backgroundColor: 'var(--border-color)' }}
                  />
                ) : (
                  <MenuRow
                    key={sub.label}
                    item={sub}
                    onClick={() => {
                      onClose();
                      sub.onClick?.()
                    }}
                  >
                    {sub.label}
                  </MenuRow>
                ),
              )}
          </motion.div>
        </AnimatePresence>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function MenuRow({
  item,
  onClick,
  onHover,
  hasSubmenu,
  isSubmenuOpen,
  children,
}: {
  item: ContextMenuAction;
  onClick: () => void;
  /** hover 时回报父行 rect，供子菜单定位；仅父项需要 */
  onHover?: (rect: DOMRect) => void;
  hasSubmenu?: boolean;
  isSubmenuOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={item.disabled}
      onMouseEnter={(e) => {
        if (hasSubmenu && onHover) onHover(e.currentTarget.getBoundingClientRect())
      }}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors',
        'hover:bg-[var(--bg-hover)]',
        item.disabled && 'opacity-40 cursor-not-allowed hover:bg-transparent',
        item.danger && 'text-[var(--danger)]',
        hasSubmenu && isSubmenuOpen && 'bg-[var(--bg-hover)]',
      )}
      style={!item.danger ? { color: 'var(--text-primary)' } : undefined}
    >
      <span className="flex-1 truncate">{children}</span>
      {/* 父项右侧三角，提示可展开 */}
      {hasSubmenu && (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          style={{ opacity: 0.5, flexShrink: 0 }}
          aria-hidden
        >
          <path d="M3 1.5L7 5L3 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function isSeparator(item: ContextMenuItem): item is ContextMenuSeparator {
  return (item as ContextMenuSeparator).separator === true;
}
