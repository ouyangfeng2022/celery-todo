/**
 * @file 顶部标题行（自绘窗口控制按钮）
 * @description 2.x 依赖 Windows titleBarOverlay 画原生 caption 按钮；Tauri 无等价
 *              能力，这里自绘最小化 / 最大化 / 关闭（decorations: false）。
 *              拖拽区用 data-tauri-drag-region（标题与按钮之间的空白可拖动整窗）。
 */

import {
  capabilities,
  closeWindow,
  minimizeWindow,
  toggleMaximizeWindow,
} from '../platform';
import { StickerIcon } from '../components/common/Icons';

interface WindowTitlebarProps {
  title: string;
  /** 贴图入口（capabilities.stickers，非 Tauri 环境隐藏）；必传当前项目 id */
  onEnterCompactMode: () => void;
}

/** caption 按钮共用样式：36px 高、46px 宽、hover 反馈，视觉与原生 overlay 接近。 */
const controlButtonClass =
  'flex h-9 w-[46px] items-center justify-center transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none';
const controlIconClass = 'pointer-events-none';

export function WindowTitlebar({ title, onEnterCompactMode }: WindowTitlebarProps) {
  return (
    <div
      className="relative flex h-full flex-1 items-center gap-3 px-7"
      style={{ backgroundColor: 'var(--bg-frame)' }}
    >
      {/* 拖拽区：标题与窗口控制按钮之间的空白处可拖动整窗。 */}
      <div
        aria-hidden="true"
        data-tauri-drag-region
        className="titlebar-drag pointer-events-auto absolute inset-y-0 right-0 left-0"
      />
      <div className="titlebar-no-drag relative z-10 min-w-0">
        <h1
          /* leading-normal 而非 leading-tight：Noto Sans SC 字体盒(18px 字号下 26px)
             高于 1.25 紧行高的行盒(22.5px)，truncate 的 overflow:hidden 会裁掉
             拉丁降部(y/g/p 等)约 0.75px；27px 行盒在 44px 顶栏内无感。 */
          className="truncate text-lg font-serif font-semibold leading-normal"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h1>
      </div>

      {/* 简洁模式入口：贴近 caption 按钮组左侧（非 Tauri 环境隐藏）。 */}
      {capabilities.stickers && (
        <button
          type="button"
          className="titlebar-no-drag absolute right-[142px] top-0 z-20 flex h-9 w-[46px] items-center justify-center transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="进入简洁模式"
          title="进入简洁模式 (Ctrl+Shift+K)"
          onClick={onEnterCompactMode}
        >
          <StickerIcon size={16} />
        </button>
      )}

      {/* 自绘 caption 按钮：最小化 / 最大化 / 关闭 */}
      <div className="titlebar-no-drag absolute right-0 top-0 z-20 flex">
        <button
          type="button"
          className={controlButtonClass}
          style={{ color: 'var(--text-secondary)' }}
          aria-label="最小化"
          onClick={minimizeWindow}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" className={controlIconClass}>
            <path d="M0 5h10" stroke="currentColor" strokeWidth="1" fill="none" />
          </svg>
        </button>
        <button
          type="button"
          className={controlButtonClass}
          style={{ color: 'var(--text-secondary)' }}
          aria-label="最大化 / 还原"
          onClick={toggleMaximizeWindow}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" className={controlIconClass}>
            <rect
              x="0.5"
              y="0.5"
              width="9"
              height="9"
              stroke="currentColor"
              strokeWidth="1"
              fill="none"
            />
          </svg>
        </button>
        <button
          type="button"
          className={`${controlButtonClass} hover:!bg-[#e81123] hover:!text-white`}
          style={{ color: 'var(--text-secondary)' }}
          aria-label="关闭"
          onClick={closeWindow}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" className={controlIconClass}>
            <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" fill="none" />
          </svg>
        </button>
      </div>
    </div>
  );
}
