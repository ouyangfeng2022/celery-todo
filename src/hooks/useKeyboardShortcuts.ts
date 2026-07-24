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
 * - Esc: 取消编辑/关闭对话框
 *
 * 项目/数据/窗口相关（Ctrl/Cmd + Shift 组合，避开上面的单字母）：
 * - Ctrl/Cmd + Shift + N: 新建项目
 * - Ctrl/Cmd + Shift + I: 导入数据
 * - Ctrl/Cmd + Shift + E: 导出全部数据
 * - Ctrl/Cmd + Shift + L: 导出当前列表
 * - Ctrl/Cmd + Shift + K: 进入简洁模式（贴图浮窗）
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
  onEscape?: () => void;
  // === Ctrl/Cmd + Shift 组合：对应顶部「项目/数据/窗口」菜单的操作 ===
  onCreateProject?: () => void;
  onImport?: () => void;
  onExportAll?: () => void;
  onExportCsv?: () => void;
  onEnterCompactMode?: () => void;
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

      // Ctrl/Cmd + Shift 组合：优先于单字母判断，避免 Ctrl+Shift+N 落到 case 'n'。
      // 这一组对应顶部「项目/数据/窗口」菜单的操作，在输入框中也允许触发
      // （导入/导出/新建项目不依赖当前输入焦点）。
      if (e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case 'n':
            e.preventDefault();
            handlers.onCreateProject?.();
            return;
          case 'i':
            e.preventDefault();
            handlers.onImport?.();
            return;
          case 'e':
            e.preventDefault();
            handlers.onExportAll?.();
            return;
          case 'l':
            e.preventDefault();
            handlers.onExportCsv?.();
            return;
          case 'k':
            e.preventDefault();
            handlers.onEnterCompactMode?.();
            return;
        }
      }

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
