/**
 * @file Header - 顶部导航栏
 * @description 包含项目标题和更新入口；全局工具与搜索已移至窗口左上角。
 */

import { memo } from 'react';
import type { Project } from '../../types';
import { UpdateBadge } from '../common/UpdateBadge';

interface HeaderProps {
  project: Project | undefined;
  /** 侧栏收起时为左上角工具带留出空间 */
  toolbarInset?: boolean;
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
  toolbarInset,
  hasUpdate,
  updateVersion,
  isNewlyAvailable,
  onOpenUpdateDialog,
}: HeaderProps) {
  return (
    <header
      className="sidebar-toolbar-offset relative flex items-center gap-3 border-b px-5 py-3.5 pr-[152px]"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border-color)',
        paddingLeft: toolbarInset ? '132px' : undefined,
      }}
    >
      {/*
        拖拽区不能覆盖收起侧栏后出现在同一标题栏上的全局工具带。
        Electron 会优先把 drag 区域交给原生窗口处理，即使工具带视觉层级更高也收不到点击。
        因此只让空白标题栏参与拖拽，并在侧栏收起时从左侧明确避让工具带。
      */}
      <div
        aria-hidden="true"
        className="sidebar-drag-offset titlebar-drag pointer-events-auto absolute inset-y-0 right-[152px]"
        style={{ left: toolbarInset ? '120px' : '0px' }}
      />

      {/* 项目标题 - 衬线、克制、不喧哗 */}
      <div className="relative flex items-center gap-2 min-w-0">
        <h1
          className="text-xl font-serif truncate tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          {project?.name ?? 'Celery Todo'}
        </h1>
      </div>

      {/* 右侧操作：更新徽标。 */}
      <div className="titlebar-no-drag relative flex items-center gap-0.5">
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
