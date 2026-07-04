/**
 * @file Header - 顶部导航栏
 * @description 包含项目标题、搜索框、消息（通知）、专注模式切换
 */

import { memo, useState } from 'react';
import type { Project } from '../../types';
import { SearchBar } from '../filters/SearchBar';
import { NotificationPanel } from '../common/NotificationPanel';
import { BellIcon, FocusIcon, ListIcon } from '../common/Icons';
import type { AppNotification } from '../../types';
import { Logo } from '../common/Logo';

interface HeaderProps {
  project: Project | undefined;
  search: string;
  onSearchChange: (value: string) => void;
  searchFocusSignal?: number;
  notifications: AppNotification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDeleteNotification: (id: string) => void;
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
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onDeleteNotification,
  focusMode,
  onToggleFocusMode,
}: HeaderProps) {
  const [notifOpen, setNotifOpen] = useState(false);

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
        <Logo size={22} className="flex-shrink-0" />
        <h1
          className="text-xl font-serif truncate tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          {project?.name ?? 'Celery Todo'}
        </h1>
      </div>

      {/* 搜索框 + 消息按钮（专注模式下隐藏）。
          两者作为一个整体，使用绝对定位 + left:50% 对齐 header（=窗口）的真正水平中线，
          不受右侧 pr-[152px]（窗口控制按钮让位）影响，避免视觉偏左。
          父级 header 已设 `relative`。 */}
      {!focusMode && (
        <div className="titlebar-no-drag absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
          <div className="w-80 max-w-[36vw] flex justify-center">
            <SearchBar value={search} onChange={onSearchChange} focusSignal={searchFocusSignal} />
          </div>
          {/* 消息（通知）按钮：紧贴搜索框右侧 */}
          <div className="relative">
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="btn-ghost p-2 relative"
              aria-label="消息"
            >
              <BellIcon size={18} />
              {unreadCount > 0 && (
                <span
                  className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'white',
                    boxShadow: '0 0 0 2px var(--bg-tertiary)',
                  }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <NotificationPanel
              open={notifOpen}
              notifications={notifications}
              onMarkAsRead={onMarkAsRead}
              onMarkAllAsRead={onMarkAllAsRead}
              onDelete={onDeleteNotification}
              onClose={() => setNotifOpen(false)}
            />
          </div>
        </div>
      )}
      {/* 专注模式下用占位把切换按钮推到右侧 */}
      {focusMode && <div className="flex-1" />}

      {/* 右侧操作：仅专注模式切换（紧贴右上角窗口控制按钮）。
          消息按钮已随搜索框居中，避免被困在专注模式。 */}
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
