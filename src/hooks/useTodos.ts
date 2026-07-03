/**
 * @file useTodos - 事项管理 Hook
 * @description 封装 Todo 相关的业务逻辑，提供便捷的 API
 */

import { useCallback } from 'react';
import { useTodoStore } from '../store/useTodoStore';
import type { Priority, BatchAction } from '../types';

export function useTodos() {
  const store = useTodoStore();

  const addTodo = useCallback(
    (title: string, priority: Priority = 'medium', dueDate?: string, description?: string) => {
      // 检查是否包含分隔符，支持批量添加
      if (/[,，;；\n]/.test(title)) {
        store.addTodosBulk(title, priority, dueDate);
      } else {
        store.addTodo({ title, priority, dueDate, description });
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
    restoreTodo: store.restoreTodo,
    permanentlyDelete: store.permanentlyDelete,
    emptyRecycleBin: store.emptyRecycleBin,
  };
}
