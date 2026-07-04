/**
 * @file Notification Store - 通知状态管理
 * @description 管理应用内通知和桌面通知
 */

import { create } from 'zustand';
import type { AppNotification } from '../types';
import * as db from '../utils/database';
import { generateId } from '../utils/helpers';

interface NotificationState {
  /** 通知列表 */
  notifications: AppNotification[];
  /** 未读数量 */
  unreadCount: number;
  /** 加载通知 */
  loadNotifications: () => void;
  /** 添加通知 */
  addNotification: (params: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => void;
  /** 标记已读 */
  markAsRead: (id: string) => void;
  /** 标记全部已读 */
  markAllAsRead: () => void;
  /** 删除通知 */
  deleteNotification: (id: string) => void;
  /** 清空所有通知 */
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,

  loadNotifications: () => {
    const notifications = db.getAllNotifications();
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
    });
  },

  addNotification: (params) => {
    const notification: AppNotification = {
      ...params,
      id: generateId(),
      createdAt: new Date().toISOString(),
      read: false,
    };
    db.insertNotification(notification);
    set({
      notifications: [notification, ...get().notifications],
      unreadCount: get().unreadCount + 1,
    });
  },

  markAsRead: (id) => {
    db.markNotificationRead(id);
    const notifications = get().notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
    });
  },

  markAllAsRead: () => {
    get().notifications.forEach((n) => {
      if (!n.read) db.markNotificationRead(n.id);
    });
    set({
      notifications: get().notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    });
  },

  deleteNotification: (id) => {
    db.deleteNotification(id);
    const notifications = get().notifications.filter((n) => n.id !== id);
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
    });
  },

  clearAll: () => {
    db.clearAllNotifications();
    set({ notifications: [], unreadCount: 0 });
  },
}));
