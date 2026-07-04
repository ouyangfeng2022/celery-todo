/**
 * @file Header - 顶部导航栏
 * @description 包含项目标题、搜索框、通知、主题切换、设置
 */

import { memo, useState } from 'react';
import type { Project } from '../../types';
import { SearchBar } from '../filters/SearchBar';
import { NotificationPanel } from '../common/NotificationPanel';
import { BellIcon, SunIcon, MoonIcon, SettingsIcon, FocusIcon, ListIcon } from '../common/Icons';
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
  onOpenSettings: () => void;
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
  isDark,
  onToggleTheme,
  onOpenSettings,
  focusMode,
  onToggleFocusMode,
}: HeaderProps) {
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <header
      className="titlebar-drag flex items-center gap-3 px-5 py-3.5 border-b pr-[152px]"
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        borderColor: 'var(--border-color)',
      }}
    >
      {/* 注：侧边栏切换按钮已迁移至 App.tsx 中侧边栏旁的浮动手柄，鼠标悬浮在侧边栏区域时显示 */}

      {/* 项目标题 - 衬线、克制、不喧哗 */}
      <div className="flex items-center gap-2.5 min-w-0">
        <h1
          className="text-xl font-serif truncate tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          {project?.name ?? 'Celery Todo'}
        </h1>
      </div>

      {/* 搜索框（专注模式下隐藏，为标题让出空间） */}
      {!focusMode && (
        <div className="titlebar-no-drag flex-1 flex justify-center max-w-md">
          <SearchBar value={search} onChange={onSearchChange} focusSignal={searchFocusSignal} />
        </div>
      )}
      {/* 专注模式下用占位把切换按钮推到右侧 */}
      {focusMode && <div className="flex-1" />}

      {/* 右侧操作 */}
      <div className="titlebar-no-drag flex items-center gap-0.5">
        {/* 通知 / 主题 / 设置：专注模式下隐藏，仅保留专注切换按钮，避免被困在专注模式 */}
        {!focusMode && (
          <>
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

            <button onClick={onToggleTheme} className="btn-ghost p-2" aria-label="切换主题">
              {isDark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
            </button>

            <button onClick={onOpenSettings} className="btn-ghost p-2" aria-label="设置">
              <SettingsIcon size={18} />
            </button>
          </>
        )}

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
