/**
 * @file NotificationPanel - 通知面板
 * @description 显示应用内通知（到期提醒等）
 */

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AppNotification } from '../../types';
import { formatDate } from '../../utils/helpers';
import { BellIcon, XIcon, CheckIcon } from '../common/Icons';

interface NotificationPanelProps {
  open: boolean;
  notifications: AppNotification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function NotificationPanelComponent({
  open,
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
  onClose,
}: NotificationPanelProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <motion.div
            className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-xl z-50"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-lg)',
            }}
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* 头部 */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b sticky top-0"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                borderColor: 'var(--border-color)',
              }}
            >
              <h3
                className="text-sm font-medium flex items-center gap-2"
                style={{ color: 'var(--text-primary)' }}
              >
                <BellIcon size={15} />
                通知
              </h3>
              {notifications.some((n) => !n.read) && (
                <button
                  onClick={onMarkAllAsRead}
                  className="text-xs font-medium"
                  style={{ color: 'var(--accent)' }}
                >
                  全部已读
                </button>
              )}
            </div>

            {/* 列表 */}
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <BellIcon size={22} style={{ color: 'var(--text-quaternary)' }} />
                <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                  暂无通知
                </p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors group"
                    style={{
                      backgroundColor: notification.read ? 'transparent' : 'var(--accent-subtle)',
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {notification.title}
                        </p>
                        <p
                          className="text-xs mt-0.5 leading-relaxed"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {notification.message}
                        </p>
                        <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                          {formatDate(notification.createdAt)}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!notification.read && (
                          <button
                            onClick={() => onMarkAsRead(notification.id)}
                            className="p-1 rounded hover:bg-[var(--bg-hover)]"
                            style={{ color: 'var(--text-tertiary)' }}
                            aria-label="标记已读"
                          >
                            <CheckIcon size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => onDelete(notification.id)}
                          className="p-1 rounded hover:bg-[var(--bg-hover)]"
                          style={{ color: 'var(--text-tertiary)' }}
                          aria-label="删除"
                        >
                          <XIcon size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export const NotificationPanel = memo(NotificationPanelComponent);
