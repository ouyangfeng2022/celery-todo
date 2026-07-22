/**
 * @file AboutSection - 设置页「关于」子页面
 * @description 应用信息 + GitHub 链接 + 自动更新 UI（仅桌面端）。从 SettingsPanel 拆出。
 */

import { motion } from 'framer-motion';
import { GithubIcon, RefreshIcon, CheckIcon, AlertIcon, DownloadIcon } from '../../common/Icons';
import { Logo } from '../../common/Logo';
import { APP_VERSION } from '@/utils/version';
import type { UpdateStatus, UpdateInfoLite, DownloadProgress } from '@/hooks/useAutoUpdate';

interface AboutSectionProps {
  updateStatus: UpdateStatus;
  updateInfo: UpdateInfoLite | null;
  updateProgress: DownloadProgress | null;
  updateError: string;
  onCheckUpdates: () => void;
  onDownloadUpdate: () => void;
  onRestartToUpdate: () => void;
}

export function AboutSection({
  updateStatus,
  updateInfo,
  updateProgress,
  updateError,
  onCheckUpdates,
  onDownloadUpdate,
  onRestartToUpdate,
}: AboutSectionProps) {
  return (
    <section>
      <h3 className="claude-eyebrow mb-3" style={{ color: 'var(--text-secondary)' }}>
        关于
      </h3>
      <div className="flex items-center gap-3">
        <Logo size={40} className="flex-shrink-0" />
        <div className="flex flex-col">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Celery Todo
          </span>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            版本 {APP_VERSION || '—'}
          </span>
          <a
            href="https://github.com/ouyangfeng2022/celery-todo"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs transition-colors hover:underline"
            style={{ color: 'var(--text-secondary)' }}
          >
            <GithubIcon size={13} />
            GitHub
          </a>
        </div>
      </div>

      {/* 自动升级（仅桌面端） */}
      {window.electronAPI?.updaterCheck && (
        <div className="mt-3">
          <button
            onClick={onCheckUpdates}
            disabled={
              updateStatus === 'checking' ||
              updateStatus === 'downloading' ||
              updateStatus === 'downloaded' ||
              updateStatus === 'dismissed'
            }
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              color:
                updateStatus === 'downloaded' || updateStatus === 'dismissed'
                  ? 'var(--success)'
                  : updateStatus === 'available'
                    ? 'var(--accent)'
                    : 'var(--text-primary)',
              backgroundColor: 'var(--bg-secondary)',
            }}
          >
            {updateStatus === 'checking' ? (
              <motion.span
                className="inline-flex"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                style={{ display: 'inline-flex' }}
              >
                <RefreshIcon size={15} />
              </motion.span>
            ) : updateStatus === 'downloaded' || updateStatus === 'dismissed' ? (
              <CheckIcon size={15} />
            ) : (
              <RefreshIcon size={15} />
            )}
            {updateStatus === 'checking'
              ? '正在检查…'
              : updateStatus === 'downloading'
                ? '下载中…'
                : updateStatus === 'downloaded' || updateStatus === 'dismissed'
                  ? '更新已就绪'
                  : '检查更新'}
          </button>

          {(() => {
            if (updateStatus === 'available' && updateInfo) {
              return (
                <motion.div
                  key="available"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 flex items-start gap-2 px-2.5 py-2 rounded-md"
                  style={{
                    backgroundColor: 'var(--accent-subtle)',
                    border: '1px solid var(--accent)',
                  }}
                >
                  <motion.div
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ flexShrink: 0, color: 'var(--accent)' }}
                  >
                    <AlertIcon size={14} />
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium" style={{ color: 'var(--accent-pressed)' }}>
                      发现新版本 v{updateInfo.version}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      点击下方按钮下载。
                    </p>
                    <button
                      onClick={onDownloadUpdate}
                      className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md transition-colors hover:opacity-90"
                      style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
                    >
                      <DownloadIcon size={15} />
                      下载并安装
                    </button>
                  </div>
                </motion.div>
              );
            }
            if (updateStatus === 'downloading' && updateProgress) {
              const pct = Math.round(updateProgress.percent);
              return (
                <motion.div
                  key="downloading"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2"
                >
                  <div className="flex justify-between text-xs" style={{ color: 'var(--accent)' }}>
                    <span className="flex items-center gap-1.5">
                      <motion.span
                        className="inline-block rounded-full"
                        style={{ width: 6, height: 6, backgroundColor: 'var(--accent)' }}
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                      />
                      下载中…
                    </span>
                    <span className="font-mono">{pct}%</span>
                  </div>
                  <div
                    className="mt-1 h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: 'var(--bg-secondary)' }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: 'var(--accent)' }}
                      initial={false}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                    />
                  </div>
                </motion.div>
              );
            }
            if (updateStatus === 'downloaded' || updateStatus === 'dismissed') {
              return (
                <motion.div
                  key={updateStatus}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 flex items-start gap-2 px-2.5 py-2 rounded-md"
                  style={{
                    backgroundColor: 'var(--accent-subtle)',
                    border: '1px solid var(--success)',
                  }}
                >
                  <motion.span
                    style={{ color: 'var(--success)', flexShrink: 0 }}
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.2, 1] }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                  >
                    <CheckIcon size={14} />
                  </motion.span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs" style={{ color: 'var(--success)', fontWeight: 500 }}>
                      {updateStatus === 'dismissed'
                        ? '更新已就绪，可随时重启完成安装。'
                        : '更新已下载，可立即重启完成安装。'}
                    </p>
                    <button
                      onClick={onRestartToUpdate}
                      className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md transition-colors hover:opacity-90"
                      style={{ backgroundColor: 'var(--success)', color: '#fff' }}
                    >
                      <DownloadIcon size={15} />
                      立即重启安装
                    </button>
                  </div>
                </motion.div>
              );
            }
            if (updateStatus === 'not-available') {
              return (
                <motion.div
                  key="not-available"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 flex items-center gap-2 px-2.5 py-2 rounded-md"
                  style={{
                    backgroundColor: 'var(--accent-subtle)',
                    border: '1px solid var(--success)',
                  }}
                >
                  <motion.span
                    style={{ color: 'var(--success)', flexShrink: 0 }}
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.2, 1] }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                  >
                    <CheckIcon size={14} />
                  </motion.span>
                  <p className="text-xs" style={{ color: 'var(--success)', fontWeight: 500 }}>
                    已是最新版本
                  </p>
                </motion.div>
              );
            }
            if (updateStatus === 'error') {
              return (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: [0, -3, 3, -2, 2, 0] }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="mt-2 flex items-start gap-2 px-2.5 py-2 rounded-md"
                  style={{
                    backgroundColor: 'var(--danger-subtle)',
                    border: '1px solid var(--danger)',
                  }}
                >
                  <motion.span
                    style={{ color: 'var(--danger)', flexShrink: 0 }}
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <AlertIcon size={14} />
                  </motion.span>
                  <p className="text-xs" style={{ color: 'var(--danger)' }}>
                    检查更新失败：{updateError || '未知错误'}
                  </p>
                </motion.div>
              );
            }
            return null;
          })()}
        </div>
      )}
    </section>
  );
}
