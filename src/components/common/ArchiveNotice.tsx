/**
 * @file ArchiveNotice - 事项归档后的置顶反馈
 * @description 告知归档或恢复结果，并提供相关操作的直达入口。
 */

import { memo, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArchiveIcon, RestoreIcon, XIcon } from './Icons';

interface NoticeBaseProps {
  count: number;
  /** 主工作区相对窗口中心的偏移量（侧栏展开时为侧栏宽度的一半） */
  horizontalOffset: number;
  onDismiss: () => void;
}

interface ArchivedNoticeProps extends NoticeBaseProps {
  variant: 'archived';
  onUndo: () => void;
  onOpenHistory: () => void;
}

interface RestoredNoticeProps extends NoticeBaseProps {
  variant: 'restored';
  projectName: string;
  onOpenProject: () => void;
}

type ArchiveNoticeProps = ArchivedNoticeProps | RestoredNoticeProps;

function ArchiveNoticeComponent({
  count,
  horizontalOffset,
  onDismiss,
  ...notice
}: ArchiveNoticeProps) {
  useEffect(() => {
    if (count === 0) return;
    const timer = window.setTimeout(onDismiss, 7000);
    return () => window.clearTimeout(timer);
  }, [count, onDismiss]);

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.aside
          role="status"
          aria-live="polite"
          // Framer Motion 会接管 transform，不能依赖 Tailwind 的 -translate-x-1/2。
          // 把 x 放进动画状态，确保始终以主工作区中线为基准水平居中。
          initial={{ opacity: 0, x: '-50%', y: -12, scale: 0.98 }}
          animate={{ opacity: 1, x: '-50%', y: 0, scale: 1 }}
          exit={{ opacity: 0, x: '-50%', y: -12, scale: 0.98 }}
          transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          className="fixed top-5 z-[60] w-fit max-w-[calc(100vw-2rem)] rounded-xl border px-4 py-2"
          style={{
            left: `calc(50% + ${horizontalOffset}px)`,
            backgroundColor: 'var(--bg-tertiary)',
            borderColor: 'var(--border-strong)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent)' }}
            >
              {notice.variant === 'archived' ? <ArchiveIcon size={15} /> : <RestoreIcon size={15} />}
            </span>
            <div className="whitespace-nowrap text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              {notice.variant === 'archived' ? (
                <>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {count} 条已归档
                  </span>
                  <span>，</span>
                  <button
                    type="button"
                    onClick={notice.onUndo}
                    className="rounded-sm font-medium underline decoration-[var(--accent)] decoration-1 underline-offset-2 transition-colors hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    style={{ color: 'var(--accent)' }}
                  >
                    撤销
                  </button>
                  <span>，或在设置中查看</span>
                  <button
                    type="button"
                    onClick={notice.onOpenHistory}
                    aria-label="在设置中查看已归档事项"
                    className="rounded-sm font-medium underline decoration-[var(--accent)] decoration-1 underline-offset-2 transition-colors hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    style={{ color: 'var(--accent)' }}
                  >
                    已归档事项
                  </button>
                </>
              ) : (
                <>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    已恢复 {count} 条事项
                  </span>
                  <span>，在</span>
                  <button
                    type="button"
                    onClick={notice.onOpenProject}
                    aria-label={`在 ${notice.projectName} 中查看`}
                    className="rounded-sm font-medium underline decoration-[var(--accent)] decoration-1 underline-offset-2 transition-colors hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    style={{ color: 'var(--accent)' }}
                  >
                    {notice.projectName}
                  </button>
                  {'中查看'}
                </>
              )}
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              style={{ color: 'var(--text-tertiary)' }}
              aria-label="关闭归档提示"
              title="关闭"
            >
              <XIcon size={15} />
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

export const ArchiveNotice = memo(ArchiveNoticeComponent);
