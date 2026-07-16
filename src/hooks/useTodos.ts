/**
 * @file useTodos - 事项管理 Hook
 * @description 封装 Todo 相关的业务逻辑，提供便捷的 API
 */

import { useCallback } from 'react';
import { useTodoStore } from '../store/useTodoStore';
import { hasBulkSeparator } from '../utils/helpers';
import type { Priority, BatchAction } from '../types';

export function useTodos() {
  const store = useTodoStore();

  const addTodo = useCallback(
    (title: string, priority: Priority = 'medium', description?: string) => {
      // 包含换行符时走批量添加（逗号/分号视为普通字符）
      if (hasBulkSeparator(title)) {
        store.addTodosBulk(title, priority);
      } else {
        store.addTodo({ title, priority, description });
      }
    },
    [store],
  );

  const updateTodo = useCallback(
    (id: string, updates: Parameters<typeof store.updateTodo>[1]) => {
      store.updateTodo(id, updates);
    },
    [store],
  );

  const deleteTodo = useCallback(
    (id: string) => {
      store.deleteTodo(id);
    },
    [store],
  );

  const toggleTodo = useCallback(
    (id: string) => {
      store.toggleTodo(id);
    },
    [store],
  );

  const batchAction = useCallback(
    (action: BatchAction, priority?: Priority) => {
      store.batchAction(action, priority);
    },
    [store],
  );

  const clearCompleted = useCallback(() => {
    store.clearCompleted();
  }, [store]);

  const reorderTodos = useCallback(
    (sourceId: string, targetId: string) => {
      store.reorderTodos(sourceId, targetId);
    },
    [store],
  );

  return {
    todos: store.todos,
    deletedTodos: store.deletedTodos,
    selectedIds: store.selectedIds,
    loading: store.loading,
    addTodo,
    updateTodo,
    deleteTodo,
    toggleTodo,
    toggleSelected: store.toggleSelected,
    selectAll: store.selectAll,
    clearSelection: store.clearSelection,
    batchAction,
    clearCompleted,
    reorderTodos,
    // store action 引用稳定，直接透传
    snapshotOrder: store.snapshotOrder,
    restoreTodo: store.restoreTodo,
    permanentlyDelete: store.permanentlyDelete,
    emptyArchive: store.emptyArchive,
  };
}
