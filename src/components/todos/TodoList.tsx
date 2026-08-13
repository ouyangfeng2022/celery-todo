/**
 * @file TodoList - 事项列表组件
 * @description 渲染筛选后的事项列表，支持拖拽排序（使用 @dnd-kit）
 */

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DndContext,
  closestCenter,
  KeyboardCode,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import type { Todo } from '../../types';
import { cn } from '../../utils/helpers';
import { markPerformance } from '../../utils/performance';
import { TodoItem } from './TodoItem';
import { EmptyState } from '../common/EmptyState';
import type { SortType, FilterType } from '../../types';

interface TodoListProps {
  todos: Todo[];
  /** 主内容区滚动容器；虚拟列表以它为滚动基准。 */
  scrollElement: HTMLElement | null;
  selectedIds: Set<string>;
  sort: SortType;
  /** 当前筛选类型，透传给 EmptyState 用于空态文案分支 */
  filter?: FilterType;
  /** 项目本身是否含有任何 todo，透传给 EmptyState 区分真空白与筛不到 */
  hasTodos?: boolean;
  onToggle: (id: string) => void;
  onEdit: (id: string, updates: Partial<Todo>) => void;
  onDelete: (id: string) => void;
  onToggleSelect: (id: string) => void;
  /** 点击标题/编辑按钮 → 打开详情浮窗 */
  onOpenDetail: (id: string) => void;
  onReorder: (sourceId: string, targetId: string) => Promise<void>;
  /** 切换排序方式（拖拽时用于自动切到「手动排序」） */
  onSortChange: (sort: SortType) => void;
  /** 拖拽切入 manual 前快照当前显示顺序到 todo.order */
  onSnapshotOrder: (ids: string[]) => Promise<void>;
  /** 全局搜索选中后定位并高亮的事项。 */
  focusTarget?: { id: string; signal: number } | null;
}

/** 可排序的 TodoItem 包装器：dnd-kit 的节点与虚拟列表的定位节点共用此元素。 */
interface SortableTodoItemProps {
  todo: Todo;
  isSelected: boolean;
  focusSignal?: number;
  onToggle: (id: string) => void;
  onEdit: (id: string, updates: Partial<Todo>) => void;
  onDelete: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onOpenDetail: (id: string) => void;
  /** 是否由虚拟列表绝对定位。具体纵向坐标由 virtualizer 直接写入 DOM。 */
  isVirtualRow?: boolean;
  /** 动态测量可变高度的 Markdown / 编辑态行。 */
  measureElement?: (element: HTMLElement | null) => void;
  virtualIndex?: number;
}

/** 超过此数量时按需挂载行，避免 DnD、Markdown 和动画同时占用大量 DOM。 */
// 30–100 条采用渐进挂载；超过百条才用窗口化列表控制长期 DOM 数量。
const VIRTUALIZE_THRESHOLD = 100;
const PROGRESSIVE_THRESHOLD = 20;
// 首批只挂载一屏左右，避免筛选点击与 20 个复杂 DnD 行在同一帧争用主线程。
const PROGRESSIVE_BATCH_SIZE = 15;

const SortableTodoItem = memo(
  forwardRef<HTMLDivElement, SortableTodoItemProps>(function SortableTodoItem(
    {
      todo,
      isSelected,
      focusSignal,
      onToggle,
      onEdit,
      onDelete,
      onToggleSelect,
      onOpenDetail,
      isVirtualRow,
      measureElement,
      virtualIndex,
    },
    ref,
  ) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
      useSortable({
        id: todo.id,
      });

    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      zIndex: isDragging ? 50 : undefined,
      position: isVirtualRow ? 'absolute' : undefined,
      left: isVirtualRow ? 0 : undefined,
      width: isVirtualRow ? '100%' : undefined,
    };

    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        setNodeRef(node);
        measureElement?.(node);
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [measureElement, ref, setNodeRef],
    );
    // virtualizer 会在滚动时更新可见行的 virtualStart。合并后的拖拽属性若每次都
    // 创建新对象，会穿透 TodoItem 的 memo，让整行标题、时间与菜单跟着每帧重渲染。
    // attributes / listeners 本身稳定时复用对象，把滚动更新限制在定位包装层。
    const dragHandleProps = useMemo(
      () =>
        ({
          ...attributes,
          ...listeners,
        }) as React.HTMLAttributes<HTMLButtonElement>,
      [attributes, listeners],
    );

    return (
      <div
        ref={setRefs}
        id={`todo-${todo.id}`}
        className={isVirtualRow ? 'todo-virtual-row' : undefined}
        data-index={virtualIndex}
        data-drag-over={isOver || undefined}
        style={style}
      >
        <TodoItem
          todo={todo}
          isSelected={isSelected}
          focusSignal={focusSignal}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleSelect={onToggleSelect}
          onOpenDetail={onOpenDetail}
          dragHandleProps={dragHandleProps}
        />
      </div>
    );
  }),
);

function TodoListComponent({
  todos,
  scrollElement,
  selectedIds,
  sort,
  filter,
  hasTodos,
  onToggle,
  onEdit,
  onDelete,
  onToggleSelect,
  onOpenDetail,
  onReorder,
  onSortChange,
  onSnapshotOrder,
  focusTarget,
}: TodoListProps) {
  // 大列表拖拽时也保持虚拟化。目标限制在当前视口和 overscan 已挂载范围，
  // 避免一次拖拽将数百个 Markdown/DnD 节点同时插入 DOM。
  // 但键盘拖拽需要能跨越视口：dnd-kit 的 droppable 只识别已挂载的行，若拖拽中
  // 不临时挂载完整列表，ArrowUp 撞到视口顶就到头，无法落到屏外目标。
  const isVirtualized = todos.length > VIRTUALIZE_THRESHOLD;
  const isProgressive = todos.length > PROGRESSIVE_THRESHOLD && !isVirtualized;
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PROGRESSIVE_BATCH_SIZE);
  const dragInProgress = activeDragId !== null;
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const progressiveSentinelRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const virtualizer = useVirtualizer({
    count: todos.length,
    enabled: isVirtualized,
    getScrollElement: () => scrollElement,
    // 数据更新或排序时按稳定 ID 复用已测量的行，避免索引变化后重新观察一批
    // 已知高度的节点。
    getItemKey: (index) => todos[index]?.id ?? index,
    estimateSize: () => 76,
    // 普通浏览只多挂载少量上下文行。此前 overscan=8 会让约两屏的 TodoItem、
    // 优先级菜单与 dnd-kit 节点同时参与滚动更新，在几十条的常见已完成列表里
    // 反而容易出现合成抖动。键盘拖拽时仍按原逻辑挂载全表。
    overscan: isVirtualized && dragInProgress ? todos.length : 4,
    scrollMargin,
    // 每行挂载时会由 ResizeObserver 回报真实高度。直接在该回调里同步更新
    // virtualizer 会与滚动事件争用一帧；交给下一帧合并，避免滚动时的布局抖动。
    useAnimationFrameWithResizeObserver: true,
    // 默认实现会在每个 scroll 事件触发 React 更新，进而令可见 TodoItem 的
    // dnd-kit Hook 一起参与 render。坐标和占位高度由 virtualizer 直接写入 DOM，
    // 仅在可见索引范围变动时 React 才需要提交新的行。
    // TodoList 初始可能为空，随后批量添加跨过阈值。该选项必须从首帧固定开启；
    // tanstack 明确不支持在运行中切换 directDomUpdates。
    directDomUpdates: true,
    directDomUpdatesMode: 'position',
  });
  const virtualItems = virtualizer.getVirtualItems();

  // 中等规模列表不预造完整 DOM。哨兵进入视口附近时再追加一批，切换到 60 条
  // 已完成事项时首帧只创建 20 行；滚动条会随批次自然延长，直到全部挂载。
  useEffect(() => {
    if (!isProgressive) return;
    const sentinel = progressiveSentinelRef.current;
    if (!sentinel || !scrollElement || visibleCount >= todos.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisibleCount((current) => Math.min(todos.length, current + PROGRESSIVE_BATCH_SIZE));
      },
      { root: scrollElement, rootMargin: '360px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isProgressive, scrollElement, todos.length, visibleCount]);

  // 大列表中真实挂载的行数应远小于总数；开发期将该数字写入 Performance Timeline，
  // 便于 1,000+ 条手工 profiling 时观察 overscan、Markdown 行高与拖拽测量的影响。
  useEffect(() => {
    if (isVirtualized) {
      markPerformance('virtual-list-mounted-rows', {
        mountedRows: virtualItems.length,
        totalRows: todos.length,
      });
    }
  }, [isVirtualized, todos.length, virtualItems.length]);

  // 主滚动区的顶部还包含统计与筛选栏。virtualizer 的 scrollOffset 是相对 main 的，
  // 需减掉列表本身的起始位置，否则滚动后会错误地提前回收仍在视口内的行。
  useLayoutEffect(() => {
    const list = listContainerRef.current;
    if (!list || !scrollElement || !isVirtualized) {
      setScrollMargin(0);
      return;
    }
    const updateScrollMargin = () => {
      setScrollMargin(
        list.getBoundingClientRect().top -
          scrollElement.getBoundingClientRect().top +
          scrollElement.scrollTop,
      );
    };
    updateScrollMargin();
    const observer = new ResizeObserver(updateScrollMargin);
    observer.observe(scrollElement);
    return () => observer.disconnect();
  }, [isVirtualized, scrollElement, todos]);

  // 仅选中状态变化时 todos 引用保持稳定。复用 ID 数组可避免 SortableContext
  // 误以为整个列表换了一批 droppable，触发不必要的 dnd-kit 注册与测量。
  const renderedTodos = useMemo(
    () => (isProgressive ? todos.slice(0, visibleCount) : todos),
    [isProgressive, todos, visibleCount],
  );
  const todoIds = useMemo(() => renderedTodos.map((todo) => todo.id), [renderedTodos]);
  const keyboardOverIdRef = useRef<string | null>(null);

  // 默认 sortableKeyboardCoordinates 依赖当前碰撞矩形寻找几何位置最近的行。
  // 虚拟列表滚动后，活动项的碰撞矩形与绝对定位行可能不在同一坐标基准，导致
  // 键盘拖拽停在视口边缘。这里直接按排序数组选择相邻行，并将它记录为本次键盘
  // 碰撞目标；普通列表继续沿用 dnd-kit 默认行为。
  const keyboardCoordinates = useCallback<KeyboardCoordinateGetter>(
    (event, { active, context, currentCoordinates }) => {
      if (!isVirtualized) {
        return sortableKeyboardCoordinates(event, { active, context, currentCoordinates });
      }
      if (event.code !== KeyboardCode.Up && event.code !== KeyboardCode.Down) {
        keyboardOverIdRef.current = null;
        return sortableKeyboardCoordinates(event, { active, context, currentCoordinates });
      }

      const activeIndex = todoIds.indexOf(String(active));
      const currentIndex = context.over ? todoIds.indexOf(String(context.over.id)) : activeIndex;
      const direction = event.code === KeyboardCode.Up ? -1 : 1;
      const targetIndex = Math.max(0, Math.min(todoIds.length - 1, currentIndex + direction));
      const targetId = todoIds[targetIndex];

      if (!targetId || targetIndex === currentIndex) {
        return sortableKeyboardCoordinates(event, { active, context, currentCoordinates });
      }

      keyboardOverIdRef.current = targetId;
      context.droppableContainers
        .get(targetId)
        ?.node.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      // 返回相同坐标仍会触发一次 drag move；碰撞策略从 ref 读取目标。
      return currentCoordinates;
    },
    [isVirtualized, todoIds],
  );

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const keyboardOverId = keyboardOverIdRef.current;
    if (
      keyboardOverId &&
      args.droppableContainers.some(
        (container) => container.id === keyboardOverId && !container.disabled,
      )
    ) {
      return [{ id: keyboardOverId }];
    }
    return closestCenter(args);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
      scrollBehavior: 'auto',
    }),
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      keyboardOverIdRef.current = null;
      setActiveDragId(null);
      const { active, over } = event;
      if (over && active.id !== over.id) {
        // 当前非「手动排序」时，先快照当前显示顺序到 order，再切到手动排序。
        // 否则 store.todos（DB 序，按 sort_order ASC ≈ 创建顺序）与视图（如
        // created-desc 是反向的）不一致，reorderTodos 的 splice 索引取自 DB 序，
        // 切到 manual 后会跳序。snapshotOrder 是异步数据库写入，必须等它完成
        // 再调用 onReorder；并行执行时，慢机器上快照可能在 moveTodoRank 后落库，
        // 覆盖刚完成的拖拽排序。
        if (sort !== 'manual') {
          await onSnapshotOrder(todos.map((t) => t.id));
          onSortChange('manual');
        }
        await onReorder(active.id as string, over.id as string);
      }
    },
    [onReorder, onSortChange, onSnapshotOrder, sort, todos],
  );

  useEffect(() => {
    if (!focusTarget) return;
    const targetIndex = todos.findIndex((todo) => todo.id === focusTarget.id);
    if (targetIndex === -1) return;
    if (isVirtualized) virtualizer.scrollToIndex(targetIndex, { align: 'center' });
    if (isProgressive && targetIndex >= visibleCount) {
      setVisibleCount(targetIndex + 1);
    }
    requestAnimationFrame(() => {
      document.getElementById(`todo-${focusTarget.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [focusTarget, isProgressive, isVirtualized, todos, virtualizer, visibleCount]);

  if (todos.length === 0) {
    return <EmptyState filter={filter} hasTodos={hasTodos} />;
  }

  // 筛选时直接更新行，避免每项进退场动画与 dnd-kit 同时参与布局计算。
  const listContent = renderedTodos.map((todo) => (
    <SortableTodoItem
      key={todo.id}
      todo={todo}
      isSelected={selectedIds.has(todo.id)}
      focusSignal={todo.id === focusTarget?.id ? focusTarget.signal : undefined}
      onToggle={onToggle}
      onEdit={onEdit}
      onDelete={onDelete}
      onToggleSelect={onToggleSelect}
      onOpenDetail={onOpenDetail}
    />
  ));

  const setVirtualListContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      listContainerRef.current = node;
      virtualizer.containerRef(node);
    },
    [virtualizer],
  );

  const virtualListContent = (
    <div ref={setVirtualListContainerRef} className="relative">
      {virtualItems.map((virtualItem) => {
        const todo = todos[virtualItem.index];
        if (!todo) return null;
        return (
          <SortableTodoItem
            key={todo.id}
            todo={todo}
            isSelected={selectedIds.has(todo.id)}
            focusSignal={todo.id === focusTarget?.id ? focusTarget.signal : undefined}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleSelect={onToggleSelect}
            onOpenDetail={onOpenDetail}
            isVirtualRow
            virtualIndex={virtualItem.index}
            measureElement={virtualizer.measureElement}
          />
        );
      })}
    </div>
  );

  // 任意排序模式下都允许拖拽；非手动排序时拖拽会自动切到手动排序（见 handleDragEnd）
  // restrictToVerticalAxis：拖拽时把位移限制为竖直方向，列表只能上下重排
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={(event) => {
        keyboardOverIdRef.current = null;
        setActiveDragId(String(event.active.id));
      }}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        keyboardOverIdRef.current = null;
        setActiveDragId(null);
      }}
      modifiers={[restrictToVerticalAxis]}
    >
      <SortableContext items={todoIds} strategy={verticalListSortingStrategy}>
        {/* 仅动画一个容器；key 让筛选切换重播短暂淡入，而不保留上一批事项等待退出。 */}
        <div
          key={filter ?? 'all'}
          aria-label="待办事项列表"
          className={
            isVirtualized
              ? 'todo-filter-content todo-filter-content-virtual'
              : cn(
                  'todo-filter-content relative space-y-1',
                  isProgressive && 'todo-filter-content-large',
                )
          }
        >
          {isVirtualized ? virtualListContent : listContent}
          {isProgressive && visibleCount < todos.length && (
            <div
              ref={progressiveSentinelRef}
              className="h-px"
              aria-hidden="true"
              data-remaining-todos={todos.length - visibleCount}
            />
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function TodoListShell(props: TodoListProps) {
  const [renderedFilter, setRenderedFilter] = useState(props.filter);

  useEffect(() => {
    if (renderedFilter === props.filter) return;
    // 先提交筛选按钮与轻量占位，让浏览器完成一次绘制；下一帧再挂载列表行。
    // 这样不会保留上一筛选的内容，也不会让复杂行阻塞按钮的即时反馈。
    const frame = requestAnimationFrame(() => setRenderedFilter(props.filter));
    return () => cancelAnimationFrame(frame);
  }, [props.filter, renderedFilter]);

  if (renderedFilter !== props.filter) {
    return (
      <div
        aria-label="待办事项列表"
        aria-busy="true"
        className="space-y-1"
        style={{ contain: 'layout paint' }}
      >
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="h-[72px] rounded-xl"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              opacity: 1 - index * 0.12,
            }}
          />
        ))}
      </div>
    );
  }

  // directDomUpdates 是 virtualizer 的挂载期配置，不能在普通列表与虚拟列表
  // 之间动态切换。跨过阈值时重建内部实例，确保虚拟路径从首帧即启用直写 DOM。
  return (
    <TodoListComponent
      key={props.todos.length > VIRTUALIZE_THRESHOLD ? 'virtual' : 'normal'}
      {...props}
    />
  );
}

export const TodoList = memo(TodoListShell);
