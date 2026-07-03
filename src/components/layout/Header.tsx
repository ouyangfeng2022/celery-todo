/**
 * @file Header - 顶部导航栏
 * @description 包含项目标题、搜索框、通知、主题切换、设置
 */

import { memo, useState } from 'react';
import type { Project } from '../../types';
import { SearchBar } from '../filters/SearchBar';
import { NotificationPanel } from '../common/NotificationPanel';
import { BellIcon, SunIcon, MoonIcon, MenuIcon, SettingsIcon } from '../common/Icons';
import type { AppNotification } from '../../types';

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
  isDark: boolean;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
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
  isDark,
  onToggleTheme,
  onToggleSidebar,
  onOpenSettings,
}: HeaderProps) {
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <header
      className="flex items-center gap-3 px-4 py-3 border-b"
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        borderColor: 'var(--border-color)',
      }}
    >
      {/* 侧边栏切换（移动端） */}
      <button
        onClick={onToggleSidebar}
        className="btn-ghost p-2 lg:hidden"
        aria-label="切换侧边栏"
      >
        <MenuIcon size={20} />
      </button>

      {/* 项目标题 */}
      <div className="flex items-center gap-2 min-w-0">
        <h1
          className="text-lg font-serif truncate"
          style={{ color: 'var(--text-primary)' }}
        >
          {project?.name ?? 'Celery Todo'}
        </h1>
      </div>

      {/* 搜索框 */}
      <div className="flex-1 flex justify-center">
        <SearchBar value={search} onChange={onSearchChange} focusSignal={searchFocusSignal} />
      </div>

      {/* 右侧操作 */}
      <div className="flex items-center gap-1">
        {/* 通知 */}
        <div className="relative">
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="btn-ghost p-2 relative"
            aria-label="通知"
          >
            <BellIcon size={20} />
            {unreadCount > 0 && (
              <span
                className="absolute top-1 right-1 w-4 h-4 rounded-full text-xs flex items-center justify-center"
                style={{ backgroundColor: 'var(--danger)', color: 'white' }}
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

        {/* 主题切换 */}
        <button
          onClick={onToggleTheme}
          className="btn-ghost p-2"
          aria-label="切换主题"
        >
          {isDark ? <SunIcon size={20} /> : <MoonIcon size={20} />}
        </button>

        {/* 设置 */}
        <button
          onClick={onOpenSettings}
          className="btn-ghost p-2"
          aria-label="设置"
        >
          <SettingsIcon size={20} />
        </button>
      </div>
    </header>
  );
}

export const Header = memo(HeaderComponent);
