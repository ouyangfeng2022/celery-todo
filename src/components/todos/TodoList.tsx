/**
 * @file TodoList - 事项列表组件
 * @description 渲染筛选后的事项列表，支持拖拽排序（使用 @dnd-kit）
 */

import { forwardRef, memo, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Todo } from '../../types';
import { TodoItem } from './TodoItem';
import { EmptyState } from '../common/EmptyState';
import type { SortType } from '../../types';

interface TodoListProps {
  todos: Todo[];
  selectedIds: Set<string>;
  sort: SortType;
  onToggle: (id: string) => void;
  onEdit: (id: string, updates: Partial<Todo>) => void;
  onDelete: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onReorder: (sourceId: string, targetId: string) => void;
}

/** 可排序的 TodoItem 包装器 */
interface SortableTodoItemProps {
  todo: Todo;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onEdit: (id: string, updates: Partial<Todo>) => void;
  onDelete: (id: string) => void;
  onToggleSelect: (id: string) => void;
}

/**
 * AnimatePresence 的 popLayout 模式会向直接子节点注入 ref 以测量退出元素的布局，
 * 因此这里用 forwardRef 暴露内部 div 的 ref，并把 framer-motion 的 ref 与
 * dnd-kit 的 setNodeRef 合并到同一个 DOM 节点上。
 */
const SortableTodoItem = forwardRef<HTMLDivElement, SortableTodoItemProps>(function SortableTodoItem(
  props,
  externalRef,
) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.todo.id,
  });

  // 合并两个 ref：dnd-kit 的 setNodeRef 和外层传入的 ref
  const setMergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      if (typeof externalRef === 'function') {
        externalRef(node);
      } else if (externalRef) {
        externalRef.current = node;
      }
    },
    [setNodeRef, externalRef],
  );

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setMergedRef} style={style}>
      <TodoItem
        todo={props.todo}
        isSelected={props.isSelected}
        onToggle={props.onToggle}
        onEdit={props.onEdit}
        onDelete={props.onDelete}
        onToggleSelect={props.onToggleSelect}
        dragHandleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>}
      />
    </div>
  );
});

function TodoListComponent({
  todos,
  selectedIds,
  sort,
  onToggle,
  onEdit,
  onDelete,
  onToggleSelect,
  onReorder,
}: TodoListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        onReorder(active.id as string, over.id as string);
      }
    },
    [onReorder],
  );

  if (todos.length === 0) {
    return <EmptyState />;
  }

  const isManualSort = sort === 'manual';

  const listContent = (
    <AnimatePresence mode="popLayout">
      {todos.map((todo) => (
        <SortableTodoItem
          key={todo.id}
          todo={todo}
          isSelected={selectedIds.has(todo.id)}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </AnimatePresence>
  );

  // 仅在手动排序模式下启用拖拽
  if (isManualSort) {
    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={todos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">{listContent}</div>
        </SortableContext>
      </DndContext>
    );
  }

  return <div className="space-y-1">{listContent}</div>;
}

export const TodoList = memo(TodoListComponent);
