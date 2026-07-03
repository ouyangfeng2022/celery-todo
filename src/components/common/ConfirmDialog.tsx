/**
 * @file ConfirmDialog - 确认对话框组件
 * @description 用于删除等危险操作的二次确认
 */

import { memo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertIcon } from './Icons';

export interface ConfirmDialogProps {
  /** 是否显示 */
  open: boolean;
  /** 标题 */
  title: string;
  /** 描述 */
  message: string;
  /** 确认按钮文字 */
  confirmText?: string;
  /** 取消按钮文字 */
  cancelText?: string;
  /** 是否危险操作（红色按钮） */
  danger?: boolean;
  /** 确认回调 */
  onConfirm: () => void;
  /** 取消回调 */
  onCancel: () => void;
}

function ConfirmDialogComponent({
  open,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    },
    [onCancel, onConfirm],
  );

  useEffect(() => {
    if (open) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

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
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onCancel}
          />

          {/* 对话框 */}
          <motion.div
            className="relative w-full max-w-md claude-card p-6"
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <div className="flex items-start gap-4">
              {danger && (
                <div
                  className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'var(--danger-light)', color: 'var(--danger)' }}
                >
                  <AlertIcon size={20} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold mb-1" style={{ fontFamily: 'var(--font-serif, serif)' }}>
                  {title}
                </h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {message}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button className="btn-secondary" onClick={onCancel}>
                {cancelText}
              </button>
              <button
                className="btn-primary"
                onClick={onConfirm}
                style={danger ? { backgroundColor: 'var(--danger)' } : undefined}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const ConfirmDialog = memo(ConfirmDialogComponent);
