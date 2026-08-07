/**
 * @file ExportNotice - 文件导出完成后的置顶反馈
 * @description 仅在 Electron 确认下载已写入磁盘后显示；文件名可直接定位到资源管理器。
 */

import { memo, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckIcon, XIcon } from './Icons';

interface ExportNoticeProps {
  fileName: string;
  filePath: string;
  horizontalOffset: number;
  onDismiss: () => void;
}

function ExportNoticeComponent({
  fileName,
  filePath,
  horizontalOffset,
  onDismiss,
}: ExportNoticeProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 8000);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return (
    <AnimatePresence>
      <motion.aside
        role="status"
        aria-live="polite"
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
            <CheckIcon size={15} />
          </span>
          <div className="min-w-0 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
            <span>已成功导出到</span>
            <button
              type="button"
              onClick={() => void window.electronAPI?.exportOpenInFolder(filePath)}
              className="ml-1 max-w-[min(26rem,calc(100vw-13rem))] truncate align-bottom font-medium underline decoration-[var(--accent)] decoration-1 underline-offset-2 transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              style={{ color: 'var(--accent)' }}
              title="在文件夹中显示"
              aria-label={`在文件夹中显示 ${fileName}`}
            >
              {fileName}
            </button>
            <span>。</span>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label="关闭导出提示"
            title="关闭"
          >
            <XIcon size={15} />
          </button>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}

export const ExportNotice = memo(ExportNoticeComponent);
