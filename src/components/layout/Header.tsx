/**
 * @file Header - 顶部导航栏
 * @description 包含项目标题、搜索框、专注模式切换
 */

import { memo } from 'react';
import type { Project } from '../../types';
import { SearchBar } from '../filters/SearchBar';
import { FocusIcon, ListIcon } from '../common/Icons';

interface HeaderProps {
  project: Project | undefined;
  search: string;
  onSearchChange: (value: string) => void;
  searchFocusSignal?: number;
  /** 是否处于专注模式 */
  focusMode: boolean;
  /** 切换专注 / 完整模式 */
  onToggleFocusMode: () => void;
}

function HeaderComponent({
  project,
  search,
  onSearchChange,
  searchFocusSignal,
  focusMode,
  onToggleFocusMode,
}: HeaderProps) {
  return (
    <header
      className="titlebar-drag relative flex items-center gap-3 px-5 py-3.5 border-b pr-[152px]"
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        borderColor: 'var(--border-color)',
      }}
    >
      {/* 注：侧边栏切换按钮已迁移至 App.tsx 中侧边栏旁的浮动手柄，鼠标悬浮在侧边栏区域时显示 */}

      {/* 项目标题 - 衬线、克制、不喧哗 */}
      <div className="flex items-center gap-2 min-w-0">
        <h1
          className="text-xl font-serif truncate tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          {project?.name ?? 'Celery Todo'}
        </h1>
      </div>

      {/* 搜索框（专注模式下隐藏）。
          使用绝对定位 + left:50% 对齐 header（=窗口）的真正水平中线，
          不受右侧 pr-[152px]（窗口控制按钮让位）影响，避免视觉偏左。
          父级 header 已设 `relative`。 */}
      {!focusMode && (
        <div className="titlebar-no-drag absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
          <div className="w-80 max-w-[36vw] flex justify-center">
            <SearchBar value={search} onChange={onSearchChange} focusSignal={searchFocusSignal} />
          </div>
        </div>
      )}
      {/* 专注模式下用占位把切换按钮推到右侧 */}
      {focusMode && <div className="flex-1" />}

      {/* 右侧操作：仅专注模式切换（紧贴右上角窗口控制按钮）。 */}
      <div className="titlebar-no-drag flex items-center gap-0.5">
        {/* 专注 / 完整 模式切换：专注时显示 ListIcon（切回完整），完整时显示 FocusIcon */}
        <button
          onClick={onToggleFocusMode}
          className="btn-ghost p-2"
          aria-label={focusMode ? '退出专注模式' : '进入专注模式'}
          title={focusMode ? '退出专注模式 (Ctrl+P)' : '进入专注模式 (Ctrl+P)'}
        >
          {focusMode ? <ListIcon size={18} /> : <FocusIcon size={18} />}
        </button>
      </div>
    </header>
  );
}

export const Header = memo(HeaderComponent);
