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
      className="flex items-center gap-3 px-5 py-3.5 border-b"
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

      {/* 项目标题 - 衬线、克制、不喧哗 */}
      <div className="flex items-center gap-2.5 min-w-0">
        <h1
          className="text-xl font-serif truncate tracking-tight"
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
      <div className="flex items-center gap-0.5">
        {/* 通知 */}
        <div className="relative">
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="btn-ghost p-2 relative"
            aria-label="通知"
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

        {/* 主题切换 */}
        <button
          onClick={onToggleTheme}
          className="btn-ghost p-2"
          aria-label="切换主题"
        >
          {isDark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
        </button>

        {/* 设置 */}
        <button
          onClick={onOpenSettings}
          className="btn-ghost p-2"
          aria-label="设置"
        >
          <SettingsIcon size={18} />
        </button>
      </div>
    </header>
  );
}

export const Header = memo(HeaderComponent);
