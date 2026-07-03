/**
 * @file useNotification - 通知 Hook
 * @description 管理桌面通知和应用内通知，检查即将到期的事项
 */

import { useCallback, useEffect, useRef } from 'react';
import { useNotificationStore } from '../store/useNotificationStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTodoStore } from '../store/useTodoStore';
import { isDueSoon, isOverdue } from '../utils/helpers';
import type { Todo } from '../types';

/** 请求通知权限 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/** 发送桌面通知 */
function sendDesktopNotification(title: string, body: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
    });
  } catch {
    // 通知发送失败时静默处理
  }
}

export function useNotification() {
  const { notifications, unreadCount, addNotification, markAsRead, markAllAsRead, deleteNotification, clearAll, loadNotifications } =
    useNotificationStore();
  const settings = useSettingsStore();
  const todos = useTodoStore((s) => s.todos);
  const checkedRef = useRef<Set<string>>(new Set());

  /** 检查即将到期和已过期的事项 */
  const checkDueTodos = useCallback(
    (todoList: Todo[]) => {
      if (!settings.notificationsEnabled) return;

      for (const todo of todoList) {
        if (todo.completed) continue;
        if (checkedRef.current.has(todo.id)) continue;

        if (isOverdue(todo.dueDate)) {
          checkedRef.current.add(todo.id);
          addNotification({
            type: 'warning',
            title: '事项已过期',
            message: `"${todo.title}" 已超过截止日期`,
            todoId: todo.id,
          });
          sendDesktopNotification('事项已过期', `"${todo.title}" 已超过截止日期`);
        } else if (isDueSoon(todo.dueDate, settings.notificationLeadHours)) {
          checkedRef.current.add(todo.id);
          addNotification({
            type: 'reminder',
            title: '事项即将到期',
            message: `"${todo.title}" 将在 ${settings.notificationLeadHours} 小时内到期`,
            todoId: todo.id,
          });
          sendDesktopNotification('事项即将到期', `"${todo.title}" 将在 ${settings.notificationLeadHours} 小时内到期`);
        }
      }
    },
    [settings.notificationsEnabled, settings.notificationLeadHours, addNotification],
  );

  // 定时检查（每 5 分钟）
  useEffect(() => {
    checkDueTodos(todos);
    const interval = setInterval(() => {
      checkDueTodos(useTodoStore.getState().todos);
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [todos, checkDueTodos]);

  // 初始化时请求权限
  useEffect(() => {
    if (settings.notificationsEnabled) {
      void requestNotificationPermission();
    }
  }, [settings.notificationsEnabled]);

  return {
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    loadNotifications,
    requestPermission: requestNotificationPermission,
  };
}
