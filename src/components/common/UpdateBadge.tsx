/**
 * @file UpdateBadge - 更新可用徽标按钮
 * @description 当检查到新版本（status === 'available'）时在 Header / 专注模式
 *              浮动指示器内显示，点击唤出 UpdateDialog（下载/进度/重启全流程弹窗）。
 *              红点高亮仅在「本次启动首次发现该版本」时出现（isNewlyAvailable），
 *              用户查看后熄灭；首次发现时 App.tsx 还会自动弹出 UpdateDialog。
 */

import { memo } from 'react';
import { SparkleIcon } from './Icons';

interface UpdateBadgeProps {
  /** 待安装的新版本号，用于 tooltip 展示 */
  version?: string;
  /** 是否为本次启动首次发现，控制红点高亮 */
  isNewlyAvailable?: boolean;
  /** 点击：唤出 UpdateDialog */
  onClick: () => void;
}

function UpdateBadgeComponent({ version, isNewlyAvailable, onClick }: UpdateBadgeProps) {
  const title = version ? `发现新版本 v${version}，点击查看` : '发现新版本，点击查看';
  return (
    <button onClick={onClick} className="btn-ghost relative p-2" aria-label={title} title={title}>
      <SparkleIcon size={18} />
      {isNewlyAvailable && (
        // 右上角红点：仅本次启动首次发现时显示，提示用户「还没看过」
        <span
          className="pointer-events-none absolute top-1 right-1 inline-flex h-2 w-2 rounded-full"
          style={{ backgroundColor: 'var(--danger)' }}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

export const UpdateBadge = memo(UpdateBadgeComponent);
