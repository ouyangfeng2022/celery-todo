/**
 * @file Header - 顶部导航栏
 * @description 包含项目标题、搜索框和桌面贴图入口
 */

import { memo } from 'react';
import type { Project } from '../../types';
import { SearchBar } from '../filters/SearchBar';
import { UpdateBadge } from '../common/UpdateBadge';

interface HeaderProps {
  project: Project | undefined;
  search: string;
  onSearchChange: (value: string) => void;
  searchFocusSignal?: number;
  /** 当前是否有可用的更新（available 状态）。undefined 表示非桌面端，不渲染徽标 */
  hasUpdate?: boolean;
  /** 可用更新版本号，用于 tooltip */
  updateVersion?: string;
  /** 本次启动首次发现该版本时高亮红点 */
  isNewlyAvailable?: boolean;
  /** 点击徽标：唤出 UpdateDialog（下载/进度/重启全流程弹窗） */
  onOpenUpdateDialog?: () => void;
}

function HeaderComponent({
  project,
  search,
  onSearchChange,
  searchFocusSignal,
  hasUpdate,
  updateVersion,
  isNewlyAvailable,
  onOpenUpdateDialog,
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

      {/* 搜索框。
          使用绝对定位 + left:50% 对齐 header（=窗口）的真正水平中线，
          不受右侧 pr-[152px]（窗口控制按钮让位）影响，避免视觉偏左。
          父级 header 已设 `relative`。 */}
      <div className="titlebar-no-drag absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
        <div className="w-80 max-w-[36vw] flex justify-center">
          <SearchBar value={search} onChange={onSearchChange} focusSignal={searchFocusSignal} />
        </div>
      </div>
      {/* 右侧操作：更新徽标。 */}
      <div className="titlebar-no-drag flex items-center gap-0.5">
        {/* 更新可用徽标：发现新版本时出现，点击唤出 UpdateDialog */}
        {hasUpdate && onOpenUpdateDialog && (
          <UpdateBadge
            version={updateVersion}
            isNewlyAvailable={isNewlyAvailable}
            onClick={onOpenUpdateDialog}
          />
        )}
      </div>
    </header>
  );
}

export const Header = memo(HeaderComponent);
