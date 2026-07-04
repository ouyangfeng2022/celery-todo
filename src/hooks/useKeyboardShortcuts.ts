/**
 * @file useKeyboardShortcuts - 键盘快捷键 Hook
 * @description 全局键盘快捷键管理
 *
 * 支持的快捷键：
 * - Ctrl/Cmd + N: 新建事项（聚焦输入框）
 * - Ctrl/Cmd + S: 手动保存
 * - Ctrl/Cmd + F: 聚焦搜索框
 * - Ctrl/Cmd + /: 显示快捷键帮助
 * - Ctrl/Cmd + 1/2/3: 切换筛选视图（全部/进行中/已完成）
 * - Ctrl/Cmd + B: 切换侧边栏
 * - Ctrl/Cmd + D: 切换深色/浅色主题
 * - Ctrl/Cmd + P: 切换专注模式
 * - Esc: 取消编辑/关闭对话框
 */

import { useEffect } from 'react';

export interface ShortcutHandlers {
  onNewTodo?: () => void;
  onSave?: () => void;
  onSearch?: () => void;
  onShowHelp?: () => void;
  onFilterAll?: () => void;
  onFilterActive?: () => void;
  onFilterCompleted?: () => void;
  onToggleSidebar?: () => void;
  onToggleTheme?: () => void;
  onToggleFocusMode?: () => void;
  onEscape?: () => void;
}

/** 判断是否在输入框中 */
function isInputFocused(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || (active as HTMLElement).isContentEditable;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;

      // Esc 始终生效
      if (e.key === 'Escape') {
        handlers.onEscape?.();
        return;
      }

      if (!mod) return;

      // 在输入框中时，只允许部分快捷键
      const inInput = isInputFocused();

      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault();
          handlers.onNewTodo?.();
          break;
        case 's':
          e.preventDefault();
          handlers.onSave?.();
          break;
        case 'f':
          e.preventDefault();
          handlers.onSearch?.();
          break;
        case '/':
          e.preventDefault();
          handlers.onShowHelp?.();
          break;
        case 'b':
          if (!inInput) {
            e.preventDefault();
            handlers.onToggleSidebar?.();
          }
          break;
        case 'd':
          if (!inInput) {
            e.preventDefault();
            handlers.onToggleTheme?.();
          }
          break;
        case 'p':
          if (!inInput) {
            e.preventDefault();
            handlers.onToggleFocusMode?.();
          }
          break;
        case '1':
          if (!inInput) {
            e.preventDefault();
            handlers.onFilterAll?.();
          }
          break;
        case '2':
          if (!inInput) {
            e.preventDefault();
            handlers.onFilterActive?.();
          }
          break;
        case '3':
          if (!inInput) {
            e.preventDefault();
            handlers.onFilterCompleted?.();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}
