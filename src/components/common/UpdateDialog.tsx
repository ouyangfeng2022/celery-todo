/**
 * @file UpdateDialog - 升级流程弹窗
 * @description 发现新版本时主动弹出，并在同一弹窗内承载「下载 → 进度 → 重启安装」
 *              的完整状态机。取代原来「点徽标跳设置面板 + 下载完成用 ConfirmDialog 提示」
 *              的拆分流程，让用户的注意力始终停留在同一个焦点位置。
 *
 *              状态切换（由 useAutoUpdate 推动status prop）：
 *                available → 点「立即更新」 → downloading（不可关闭）→ downloaded
 *                available/downloaded → 点「稍后」→ onClose
 *
 *              overlay / framer-motion / Escape 键盘模式参考 ConfirmDialog。
 */

import { memo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertIcon, CheckIcon, DownloadIcon, XIcon } from './Icons';
import type { UpdateStatus, UpdateInfoLite, DownloadProgress } from '../../hooks/useAutoUpdate';

export interface UpdateDialogProps {
  /** 是否显示 */
  open: boolean;
  /** 当前升级状态（available / downloading / downloaded / dismissed） */
  status: UpdateStatus;
  /** 新版本信息 */
  updateInfo: UpdateInfoLite | null;
  /** 下载进度（仅 downloading 状态下使用） */
  progress: DownloadProgress | null;
  /** 开始下载（available → downloading） */
  onDownload: () => void;
  /** 退出并安装（downloaded/dismissed → 重启） */
  onRestart: () => void;
  /** 关闭弹窗：available 阶段放弃下载 / downloaded 阶段选择稍后 */
  onClose: () => void;
}

function UpdateDialogComponent({
  open,
  status,
  updateInfo,
  progress,
  onDownload,
  onRestart,
  onClose,
}: UpdateDialogProps) {
  // 下载中禁用 Escape 与遮罩点击，避免留下半包状态（electron-updater 无 cancelDownload IPC）
  const canClose = status !== 'downloading';

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!canClose) return;
      if (e.key === 'Escape') onClose();
    },
    [canClose, onClose],
  );

  useEffect(() => {
    if (open && canClose) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, canClose, handleKeyDown]);

  const version = updateInfo?.version;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* 遮罩 */}
          <div
            className="absolute inset-0 backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(47, 45, 39, 0.4)' }}
            onClick={canClose ? onClose : undefined}
          />

          {/* 对话框 */}
          <motion.div
            className="relative w-full max-w-md rounded-claude p-6"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-lg)',
            }}
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* 右上角关闭按钮（下载中隐藏） */}
            {canClose && (
              <button
                onClick={onClose}
                className="btn-ghost absolute top-3 right-3 p-1.5"
                aria-label="关闭"
              >
                <XIcon size={16} />
              </button>
            )}

            {/* ===== available：发现新版本 ===== */}
            {status === 'available' && (
              <div className="flex items-start gap-4">
                <motion.div
                  className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--accent-subtle)',
                    color: 'var(--accent)',
                  }}
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <AlertIcon size={18} />
                </motion.div>
                <div className="flex-1 min-w-0">
                  <h3
                    className="text-lg font-serif font-semibold mb-1.5 leading-tight"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {version ? `发现新版本 v${version}` : '发现新版本'}
                  </h3>
                  <p
                    className="text-sm leading-relaxed text-pretty"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    立即下载并更新到最新版本？
                  </p>
                </div>
              </div>
            )}

            {/* ===== downloading：下载进度 ===== */}
            {status === 'downloading' && (
              <div>
                <h3
                  className="text-lg font-serif font-semibold mb-3 leading-tight"
                  style={{ color: 'var(--text-primary)' }}
                >
                  正在下载更新
                  {version ? ` v${version}` : ''}
                </h3>
                <div
                  className="flex justify-between text-xs mb-1"
                  style={{ color: 'var(--accent)' }}
                >
                  <span className="flex items-center gap-1.5">
                    <motion.span
                      className="inline-block rounded-full"
                      style={{ width: 6, height: 6, backgroundColor: 'var(--accent)' }}
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    下载中…
                  </span>
                  <span className="font-mono">
                    {progress ? `${Math.round(progress.percent)}%` : '…'}
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: 'var(--accent)' }}
                    initial={false}
                    animate={{ width: `${progress ? Math.round(progress.percent) : 0}%` }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  />
                </div>
                <p className="mt-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  下载完成后将提示您重启以完成安装，请勿关闭窗口。
                </p>
              </div>
            )}

            {/* ===== downloaded/dismissed：已就绪，重启安装 ===== */}
            {(status === 'downloaded' || status === 'dismissed') && (
              <div className="flex items-start gap-4">
                <motion.div
                  className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--accent-subtle)',
                    color: 'var(--success)',
                  }}
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.2, 1] }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                >
                  <CheckIcon size={18} />
                </motion.div>
                <div className="flex-1 min-w-0">
                  <h3
                    className="text-lg font-serif font-semibold mb-1.5 leading-tight"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    更新已就绪
                  </h3>
                  <p
                    className="text-sm leading-relaxed text-pretty"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {version
                      ? `新版本 v${version} 已下载完成，是否立即重启以完成安装？`
                      : '新版本已下载完成，是否立即重启以完成安装？'}
                  </p>
                </div>
              </div>
            )}

            {/* ===== 按钮区 ===== */}
            <div className="flex justify-end gap-2 mt-6">
              {status === 'available' && (
                <>
                  <button className="btn-secondary" onClick={onClose}>
                    稍后
                  </button>
                  <button className="btn-primary flex items-center gap-1.5" onClick={onDownload}>
                    <DownloadIcon size={15} />
                    立即更新
                  </button>
                </>
              )}
              {status === 'downloading' && (
                <button className="btn-secondary" disabled>
                  请稍候…
                </button>
              )}
              {(status === 'downloaded' || status === 'dismissed') && (
                <>
                  <button className="btn-secondary" onClick={onClose}>
                    稍后
                  </button>
                  <button className="btn-primary flex items-center gap-1.5" onClick={onRestart}>
                    <DownloadIcon size={15} />
                    立即重启
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const UpdateDialog = memo(UpdateDialogComponent);
