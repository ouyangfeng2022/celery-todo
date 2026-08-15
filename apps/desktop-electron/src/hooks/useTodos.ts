/**
 * @file useTodos - 事项管理 Hook
 * @description 封装 Todo 相关的业务逻辑，提供便捷的 API
 */

import { useCallback } from 'react';
import { useTodoStore } from '../store/useTodoStore';
import { hasBulkSeparator } from '../utils/helpers';
import type { Priority, BatchAction } from '../types';

export function useTodos() {
  // 分字段订阅：事项列表每次变动都会让 App 重渲染，但操作函数本身在 Zustand
  // store 生命周期内稳定。不要订阅整个 state，否则每次 set 都会让下面的
  // useCallback 生成新引用，进而破坏 TodoList / TodoItem 的 memo。
  const todos = useTodoStore((state) => state.todos);
  const deletedTodos = useTodoStore((state) => state.deletedTodos);
  const selectedIds = useTodoStore((state) => state.selectedIds);
  const loading = useTodoStore((state) => state.loading);
  const addTodoAction = useTodoStore((state) => state.addTodo);
  const addTodosBulk = useTodoStore((state) => state.addTodosBulk);
  const updateTodoAction = useTodoStore((state) => state.updateTodo);
  const deleteTodoAction = useTodoStore((state) => state.deleteTodo);
  const toggleTodoAction = useTodoStore((state) => state.toggleTodo);
  const toggleSelected = useTodoStore((state) => state.toggleSelected);
  const selectAll = useTodoStore((state) => state.selectAll);
  const clearSelection = useTodoStore((state) => state.clearSelection);
  const batchActionAction = useTodoStore((state) => state.batchAction);
  const clearCompleted = useTodoStore((state) => state.clearCompleted);
  const reorderTodos = useTodoStore((state) => state.reorderTodos);
  const snapshotOrder = useTodoStore((state) => state.snapshotOrder);
  const restoreTodo = useTodoStore((state) => state.restoreTodo);
  const permanentlyDelete = useTodoStore((state) => state.permanentlyDelete);
  const emptyArchive = useTodoStore((state) => state.emptyArchive);

  const addTodo = useCallback(
    (title: string, priority: Priority = 'medium', description?: string, plannedDate?: string) => {
      // 包含换行符时走批量添加（逗号/分号视为普通字符）
      if (hasBulkSeparator(title)) {
        addTodosBulk(title, priority, plannedDate);
      } else {
        addTodoAction({ title, priority, description, plannedDate });
      }
    },
    [addTodoAction, addTodosBulk],
  );

  const updateTodo = useCallback(
    (id: string, updates: Parameters<typeof updateTodoAction>[1]) => {
      updateTodoAction(id, updates);
    },
    [updateTodoAction],
  );

  const deleteTodo = useCallback(
    (id: string) => {
      deleteTodoAction(id);
    },
    [deleteTodoAction],
  );

  const toggleTodo = useCallback(
    (id: string) => {
      toggleTodoAction(id);
    },
    [toggleTodoAction],
  );

  const batchAction = useCallback(
    (action: BatchAction, priority?: Priority) => {
      batchActionAction(action, priority);
    },
    [batchActionAction],
  );

  return {
    todos,
    deletedTodos,
    selectedIds,
    loading,
    addTodo,
    updateTodo,
    deleteTodo,
    toggleTodo,
    toggleSelected,
    selectAll,
    clearSelection,
    batchAction,
    clearCompleted,
    reorderTodos,
    // store action 引用稳定，直接透传
    snapshotOrder,
    restoreTodo,
    permanentlyDelete,
    emptyArchive,
  };
}
