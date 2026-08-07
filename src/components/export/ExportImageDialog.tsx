/**
 * @file ExportImageDialog - 导出项目为图片的预览弹窗
 * @description 镜像 ConfirmDialog 的视觉模式（framer-motion + backdrop + Esc 关闭），
 *   但承载自定义内容：① 范围筛选单选（全部/未完成/已完成）
 *   ② 居中展示事项摘要；完整卡片离屏渲染，仅用于生成 PNG
 *   ③ 底部三个操作：复制到剪贴板 / 下载 PNG / 返回上一步
 *
 * 截图原理：完整 ExportImageCard 离屏保留在 DOM 中，html-to-image 通过 ref
 *   取得它生成 PNG；可见区域只展示前几项，避免长项目撑高弹窗。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExportImageCard, type ExportImageFilter } from './ExportImageCard';
import { exportNodeAsPngBlob } from '../../utils/exportImage';
import type { Project, Todo } from '../../types';

export interface ExportImageDialogProps {
  open: boolean;
  project: Project;
  todos: Todo[];
  /** 跳过可见预览，离屏渲染完整卡片后直接下载。 */
  autoExport?: boolean;
  onClose: () => void;
}

type FilterOption = { value: ExportImageFilter; label: string };
const FILTER_OPTIONS: FilterOption[] = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '未完成' },
  { value: 'completed', label: '已完成' },
];

/** 把 Blob 触发为下载（downloadFile 只接受 string，图片走 Blob 专用路径） */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 复制 Blob 到剪贴板，返回是否成功。Chromium 支持 ClipboardItem 的 image/png。 */
async function copyBlobToClipboard(blob: Blob): Promise<boolean> {
  try {
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') return false;
    // ClipboardItem 构造器对 MIME 类型挑剔，必须显式构造
    const item = new ClipboardItem({ 'image/png': blob });
    await navigator.clipboard.write([item]);
    return true;
  } catch {
    return false;
  }
}

export function ExportImageDialog({
  open,
  project,
  todos,
  autoExport = false,
  onClose,
}: ExportImageDialogProps) {
  const [filter, setFilter] = useState<ExportImageFilter>('all');
  const [busy, setBusy] = useState<'copy' | 'download' | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const autoExportStartedRef = useRef(false);

  // 每次打开重置局部状态（上次反馈/筛选不残留）
  useEffect(() => {
    if (open) {
      setFilter('all');
      setFeedback(null);
      setBusy(null);
    }
  }, [open, project.id]);

  // Esc 关闭（与 ConfirmDialog 一致；进行中时禁用避免中断）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && busy === null) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  const todayStamp = new Date().toISOString().split('T')[0];
  const filename = `${project.name}-${todayStamp}.png`;

  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return;
    setBusy('download');
    setFeedback(null);
    try {
      const blob = await exportNodeAsPngBlob(cardRef.current);
      downloadBlob(blob, filename);
      setFeedback({ kind: 'ok', text: '已保存到下载目录' });
    } catch (err) {
      console.error('导出图片失败', err);
      setFeedback({ kind: 'err', text: '导出失败，请重试' });
    } finally {
      setBusy(null);
    }
  }, [filename]);

  const handleCopy = useCallback(async () => {
    if (!cardRef.current) return;
    setBusy('copy');
    setFeedback(null);
    try {
      const blob = await exportNodeAsPngBlob(cardRef.current);
      const ok = await copyBlobToClipboard(blob);
      if (ok) {
        setFeedback({ kind: 'ok', text: '已复制到剪贴板' });
      } else {
        // 回退：直接下载，并提示用户
        downloadBlob(blob, filename);
        setFeedback({ kind: 'err', text: '剪贴板不可用，已改为下载' });
      }
    } catch (err) {
      console.error('复制图片失败', err);
      setFeedback({ kind: 'err', text: '复制失败，请改用下载' });
    } finally {
      setBusy(null);
    }
  }, [filename]);

  // 直接导出也复用同一张完整卡片，避免把可见预览中的截断事项写入 PNG。
  const handleAutoExport = useCallback(async () => {
    if (!cardRef.current) return;
    try {
      const blob = await exportNodeAsPngBlob(cardRef.current);
      downloadBlob(blob, filename);
    } catch (err) {
      console.error('直接导出图片失败', err);
    } finally {
      onClose();
    }
  }, [filename, onClose]);

  useEffect(() => {
    if (!open || !autoExport || autoExportStartedRef.current) return;
    // React 严格模式会重复执行 effect；直接下载必须保持幂等，避免弹出两个保存窗口。
    autoExportStartedRef.current = true;
    void handleAutoExport();
  }, [autoExport, handleAutoExport, open]);

  if (autoExport) {
    return open ? (
      <div aria-hidden="true" className="fixed left-[-10000px] top-0 pointer-events-none">
        <ExportImageCard ref={cardRef} project={project} todos={todos} filter="all" />
      </div>
    ) : null;
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[75] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* 遮罩 */}
          <div
            className="absolute inset-0 backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(47, 45, 39, 0.4)' }}
            onClick={busy === null ? onClose : undefined}
          />

          {/* 弹窗主体：宽到能舒服放下 720px 卡片预览 */}
          <motion.div
            className="relative w-full max-w-4xl rounded-claude flex flex-col overflow-hidden"
            style={{
              maxHeight: '90vh',
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-lg)',
            }}
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* 标题栏 + 范围筛选 */}
            <div
              className="flex items-center justify-between gap-3 px-6 py-4 border-b flex-wrap"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <div className="flex items-baseline gap-2 min-w-0">
                <h3
                  className="text-base font-serif font-semibold truncate"
                  style={{ color: 'var(--text-primary)' }}
                >
                  导出为图片
                </h3>
                <span className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                  {project.name}
                </span>
              </div>

              {/* 范围筛选：单选分段 */}
              <div
                className="flex items-center gap-1 p-1 rounded-md"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                {FILTER_OPTIONS.map((opt) => {
                  const active = filter === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setFilter(opt.value)}
                      className="px-3 py-1 text-xs rounded transition-colors"
                      style={{
                        backgroundColor: active ? 'var(--accent)' : 'transparent',
                        color: active ? '#fff' : 'var(--text-secondary)',
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 预览区：只显示代表性事项，长项目不会撑高弹窗。 */}
            <div
              className="flex-1 overflow-auto flex justify-center p-6"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
            >
              <div style={{ flexShrink: 0 }}>
                <ExportImageCard project={project} todos={todos} filter={filter} maxItems={6} />
              </div>
            </div>

            {/* 完整卡片仅供 PNG 生成；不影响用户看到的摘要预览。 */}
            <div aria-hidden="true" className="fixed left-[-10000px] top-0 pointer-events-none">
              <ExportImageCard ref={cardRef} project={project} todos={todos} filter={filter} />
            </div>

            {/* 底部操作栏 + 反馈 */}
            <div
              className="flex items-center gap-2 px-6 py-3 border-t"
              style={{ borderColor: 'var(--border-color)' }}
            >
              {/* 反馈文案 */}
              <div
                className="text-xs flex-1 min-w-0 truncate"
                style={{
                  color:
                    feedback?.kind === 'ok'
                      ? 'var(--success)'
                      : feedback?.kind === 'err'
                        ? 'var(--danger)'
                        : 'var(--text-quaternary)',
                }}
              >
                {feedback?.text ?? '预览仅显示部分事项；导出的 PNG 将包含全部事项'}
              </div>

              <button className="btn-secondary" onClick={onClose} disabled={busy !== null}>
                返回
              </button>
              <button className="btn-secondary" onClick={handleCopy} disabled={busy !== null}>
                {busy === 'copy' ? '复制中…' : '复制到剪贴板'}
              </button>
              <button className="btn-primary" onClick={handleDownload} disabled={busy !== null}>
                {busy === 'download' ? '导出中…' : '下载 PNG'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
