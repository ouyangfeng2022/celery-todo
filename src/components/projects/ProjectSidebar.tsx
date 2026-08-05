/**
 * @file ProjectSidebar - 项目侧边栏
 * @description 项目列表、创建/删除/重命名项目、导入导出，支持拖拽排序
 */

import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { useDismissibleLayer } from '../../hooks/useDismissibleLayer';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
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
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import type { Project } from '../../types';
import type { DownloadProgress, UpdateInfoLite, UpdateStatus } from '../../hooks/useAutoUpdate';
import type { SettingsSectionId } from '../settings/SettingsPanel';
import {
  PlusIcon,
  DownloadIcon,
  ChevronRightIcon,
  RefreshIcon,
  CheckIcon,
  SettingsIcon,
  InboxIcon,
  GithubIcon,
} from '../common/Icons';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu';
import { CountBadge } from '../common/CountBadge';
import { Logo } from '../common/Logo';

interface ProjectSidebarProps {
  projects: Project[];
  activeProjectId: string;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onExport: (projectId: string) => void;
  onReorder: (sourceId: string, targetId: string) => void;
  updateStatus?: UpdateStatus;
  updateInfo?: UpdateInfoLite | null;
  updateProgress?: DownloadProgress | null;
  /** 本次启动首次发现该版本且未查看 —— 驱动卡片上的「未读」红点 */
  isNewlyAvailable?: boolean;
  onDownloadUpdate?: () => void;
  onRestartToUpdate?: () => void;
  onOpenSettings: (section: SettingsSectionId) => void;
  /** 打开历史记录（归档）弹窗 */
  onOpenHistory: () => void;
  /** 打开帮助与反馈（GitHub README） */
  onOpenHelp: () => void;
  /** 在指定项目下新建事项：切换到该项目并唤出新建事项输入框 */
  onNewTodoInProject: (projectId: string) => void;
  /** 为指定项目创建桌面贴图 */
  onCreateSticker: (projectId: string) => void;
  /** 导入数据（与 Header「数据 → 导入数据」同一条路径） */
  onImport: () => void;
  /** 导出全部数据为 JSON 备份 */
  onExportAll: () => void;
  /** 各项目未完成 todo 数：projectId → count */
  incompleteCounts: Record<string, number>;
  /** 外部触发「新建项目」输入框聚焦：值变化时唤出并聚焦输入框 */
  autofocusCreateSignal?: number;
}

interface SidebarUpdateCardProps {
  status?: UpdateStatus;
  info?: UpdateInfoLite | null;
  progress?: DownloadProgress | null;
  /** 本次启动首次发现该版本且未查看 —— 仅在 available 分支显示红点 */
  isNewlyAvailable?: boolean;
  onDownload?: () => void;
  onRestart?: () => void;
}

/** 侧栏内的升级状态卡：升级过程始终留在用户视线内，不再打断当前工作。 */
export function SidebarUpdateCard({
  status,
  info,
  progress,
  isNewlyAvailable,
  onDownload,
  onRestart,
}: SidebarUpdateCardProps) {
  if (!status || !['available', 'downloading', 'downloaded', 'dismissed'].includes(status)) {
    return null;
  }

  const percent = Math.max(0, Math.min(100, Math.round(progress?.percent ?? 0)));

  if (status === 'available') {
    return (
      <button
        onClick={onDownload}
        className="group/update w-full rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          borderColor: 'var(--border-color)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <span className="flex items-center gap-2.5">
          <span
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent)' }}
          >
            <DownloadIcon size={14} />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className="flex items-center gap-1.5 text-[13px] font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              <span className="truncate">下载新版本{info?.version ? ` v${info.version}` : ''}</span>
              {isNewlyAvailable && (
                // 「本次启动首次发现该版本且未查看」红点：点击卡片即触发 acknowledgeUpdate 熄灭。
                <span
                  className="pointer-events-none inline-flex h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: 'var(--danger)' }}
                  aria-label="未查看"
                  title="未查看"
                />
              )}
            </span>
            <span className="block truncate text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              更新已准备好
            </span>
          </span>
          <ChevronRightIcon size={15} />
        </span>
      </button>
    );
  }

  if (status === 'downloading') {
    return (
      <div
        className="w-full rounded-xl border px-3 py-2.5"
        style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}
        aria-label={`正在下载更新 ${percent}%`}
      >
        <div className="mb-2 flex items-center justify-between gap-2 text-[12px]">
          <span
            className="flex items-center gap-2 font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            <RefreshIcon size={14} className="animate-spin" />
            正在下载更新…
          </span>
          <span className="font-mono text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            {percent}%
          </span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full"
          style={{ backgroundColor: 'var(--bg-hover)' }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: 'var(--accent)' }}
            initial={false}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          />
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onRestart}
      className="group/update w-full rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        borderColor: 'var(--border-color)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <span className="flex items-center gap-2.5">
        <span
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: 'var(--accent-subtle)',
            color: 'var(--accent)',
          }}
        >
          <CheckIcon size={14} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
            重启完成更新
          </span>
          <span className="block truncate text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            {info?.version ? `v${info.version} 已下载完成` : '新版本已下载完成'}
          </span>
        </span>
        <ChevronRightIcon size={15} />
      </span>
    </button>
  );
}

/** 单个项目行（包装为 dnd-kit 可拖动节点） */
interface SortableProjectItemProps {
  project: Project;
  isActive: boolean;
  isEditing: boolean;
  editName: string;
  incompleteCount: number;
  onSwitch: (id: string) => void;
  onEditNameChange: (value: string) => void;
  onConfirmRename: () => void;
  onCancelRename: () => void;
  /** 右键唤出上下文菜单（导出 / 重命名 / 删除） */
  onContextMenu: (e: React.MouseEvent, project: Project) => void;
  /** 在该项目下新建事项 */
  onNewTodo: (project: Project) => void;
}

function SortableProjectItem({
  project,
  isActive,
  isEditing,
  editName,
  incompleteCount,
  onSwitch,
  onEditNameChange,
  onConfirmRename,
  onCancelRename,
  onContextMenu,
  onNewTodo,
}: SortableProjectItemProps) {
  // 用 useSortable（而非 useDraggable）：前者同时注册 droppable，
  // 才能与 SortableContext 配合产出 over≠null，从而触发 onDragEnd 排序。
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
    touchAction: 'none',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative rounded-md transition-colors"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, project);
      }}
    >
      {isEditing ? (
        <input
          type="text"
          value={editName}
          onChange={(e) => onEditNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onConfirmRename();
            if (e.key === 'Escape') onCancelRename();
          }}
          onBlur={onConfirmRename}
          autoFocus
          className="w-full px-3 py-2 text-sm rounded-md border outline-none"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            borderColor: 'var(--accent)',
          }}
        />
      ) : (
        <button
          onClick={() => onSwitch(project.id)}
          {...attributes}
          {...listeners}
          // 主要操作是「点击切换项目」（光标 pointer），仅在按下拖拽时短暂变 grabbing。
          // 背景：选中态用 accent-subtle 强调色（且 hover 不变）；未选中时 hover 才出现 bg-hover。
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left rounded-md cursor-pointer active:cursor-grabbing transition-colors ${
            isActive ? 'bg-[var(--accent-subtle)]' : 'hover:bg-[var(--bg-hover)]'
          }`}
          style={{
            color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
            fontWeight: isActive ? 500 : 400,
          }}
          aria-label={`${project.name}（拖动以排序）`}
        >
          <span className="flex-1 truncate">{project.name}</span>
          {/* 未完成 todo 计数：悬浮显示操作按钮时淡出，避免位置重叠 */}
          {incompleteCount > 0 && (
            <CountBadge className="text-[var(--text-tertiary)] opacity-100 transition-opacity group-hover:opacity-0">
              {incompleteCount}
            </CountBadge>
          )}
        </button>
      )}

      {/* 悬浮操作按钮：在该项目下新建事项。其余操作（导出/重命名/删除）通过右键菜单访问 */}
      {!isEditing && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNewTodo(project);
            }}
            className="p-1 rounded hover:bg-[var(--bg-hover)]"
            style={{ color: isActive ? 'var(--accent)' : 'var(--text-tertiary)' }}
            aria-label="新建事项"
            title="新建事项"
          >
            <PlusIcon size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function ProjectSidebarComponent({
  projects,
  activeProjectId,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
  onExport,
  onReorder,
  updateStatus,
  updateInfo,
  updateProgress,
  isNewlyAvailable,
  onDownloadUpdate,
  onRestartToUpdate,
  onOpenSettings,
  onOpenHistory,
  onOpenHelp,
  onNewTodoInProject,
  onCreateSticker,
  onImport,
  onExportAll,
  incompleteCounts,
  autofocusCreateSignal,
}: ProjectSidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  // 右键菜单的弹出位置与目标项目。project 为 null 表示在列表空白处右键，
  // 此时只提供「新建项目」一项（与 Finder/Explorer 在空白处右键的行为一致）。
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; project: Project | null } | null>(
    null,
  );
  const createInputRef = useRef<HTMLInputElement>(null);
  // 设置菜单弹出层与其触发按钮的引用，用于判断点击是否落在设置区域外部
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  // 点击设置菜单外部或按下 Escape 时收起菜单。
  useDismissibleLayer(settingsMenuOpen, [settingsMenuRef, settingsButtonRef], () =>
    setSettingsMenuOpen(false),
  );

  // 外部（主区空状态按钮）触发：唤出新建输入框并聚焦
  useEffect(() => {
    if (autofocusCreateSignal) {
      setIsCreating(true);
      // 等下一帧 AnimatePresence 把 input 挂载出来再聚焦
      requestAnimationFrame(() => createInputRef.current?.focus());
    }
  }, [autofocusCreateSignal]);

  const handleCreate = useCallback(() => {
    const name = newProjectName.trim();
    if (name) {
      onCreate(name);
      setNewProjectName('');
      setIsCreating(false);
    }
  }, [newProjectName, onCreate]);

  const handleStartRename = useCallback((project: Project) => {
    setEditingId(project.id);
    setEditName(project.name);
  }, []);

  const handleConfirmRename = useCallback(() => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim());
    }
    setEditingId(null);
  }, [editingId, editName, onRename]);

  // 项目项右键菜单：项目操作 / 贴图 / 删除。贴图会打开独立窗口，故单独成组。
  const handleItemContextMenu = useCallback((e: React.MouseEvent, project: Project) => {
    setCtxMenu({ x: e.clientX, y: e.clientY, project });
  }, []);

  // 唤出新建项目输入框：点击「+」按钮、列表空白处右键、主区空状态按钮共用同一流程。
  const handleStartCreate = useCallback(() => {
    setIsCreating(true);
    // 等下一帧 AnimatePresence 把 input 挂载出来再聚焦
    requestAnimationFrame(() => createInputRef.current?.focus());
  }, []);

  // 列表空白处右键：仅提供「新建项目」（Finder/Explorer 习惯）。
  const handleContainerContextMenu = useCallback((e: React.MouseEvent) => {
    // 命中具体项目行时，由该行的 onContextMenu 处理（已 stopPropagation），不会走到这里。
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, project: null });
  }, []);

  // 右键菜单项：在每次渲染时按当前目标项目构造，确保回调拿到最新引用
  const ctxMenuItems: ContextMenuItem[] = ctxMenu
    ? [
        // 空白处右键仅显示新建项目；命中项目行时把「新建项目」置顶并加分隔线，
        // 让用户在任意位置右键都能一步新建项目。
        {
          label: '新建项目',
          onClick: () => {
            handleStartCreate();
          },
        },
        ...(ctxMenu.project
          ? ([
              { separator: true },
              {
                label: '新建事项',
                onClick: () => {
                  onNewTodoInProject(ctxMenu.project!.id);
                },
              },
              {
                label: '导出项目',
                onClick: () => {
                  onExport(ctxMenu.project!.id);
                },
              },
              {
                label: '重命名',
                onClick: () => {
                  handleStartRename(ctxMenu.project!);
                },
              },
              { separator: true },
              {
                label: '创建贴图',
                onClick: () => {
                  onCreateSticker(ctxMenu.project!.id);
                },
              },
              { separator: true },
              {
                label: '删除项目',
                danger: true,
                onClick: () => {
                  setDeleteTarget(ctxMenu.project!);
                },
              },
            ] as ContextMenuItem[])
          : ([
              { separator: true },
              {
                label: '导入数据',
                onClick: () => {
                  onImport();
                },
              },
              {
                label: '导出全部数据',
                onClick: () => {
                  onExportAll();
                },
              },
            ] as ContextMenuItem[])),
      ]
    : [];

  // 拖拽排序：distance:5 区分点击与拖拽，避免影响项目切换
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

  return (
    <aside
      // 不加 border-r:整个 L 形(顶部行 + 左下项目栏)仅靠 --bg-frame(暖陶土橙)与主区
      // --bg-primary(暖纸色)的颜色差异区分,视觉合成一体。
      className="w-[280px] flex-shrink-0 h-full flex flex-col"
      style={{ backgroundColor: 'var(--bg-frame)' }}
    >
      {/* 侧边栏标题行：应用名在左，搜索按钮由 Header 定位在右侧，与参考图一致。 */}
      <div className="flex h-12 flex-shrink-0 items-center px-5">
        <span
          className="brand-wordmark flex items-center gap-[0.35em] truncate text-base"
          style={{ color: 'var(--text-primary)' }}
        >
          <span className="italic">Celery</span>
          <span
            aria-hidden="true"
            className="h-[5px] w-[5px] flex-shrink-0 rounded-full"
            style={{ backgroundColor: 'var(--accent)' }}
          />
          <span>Todo</span>
        </span>
      </div>

      {/* 项目列表 */}
      <div
        className="flex-1 overflow-y-auto px-3 pb-4 pt-1"
        onContextMenu={handleContainerContextMenu}
      >
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
            项目
          </span>
          <button onClick={handleStartCreate} className="btn-ghost p-1" aria-label="新建项目">
            <PlusIcon size={14} />
          </button>
        </div>

        {/* 新建项目输入 */}
        <AnimatePresence>
          {isCreating && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-1 mb-1 overflow-hidden"
            >
              <input
                ref={createInputRef}
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') {
                    setIsCreating(false);
                    setNewProjectName('');
                  }
                }}
                onBlur={() => {
                  if (newProjectName.trim()) handleCreate();
                  else setIsCreating(false);
                }}
                placeholder="项目名称..."
                autoFocus
                className="w-full px-2.5 py-1.5 text-sm rounded-md border outline-none"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  borderColor: 'var(--border-strong)',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 项目项（支持拖拽排序） */}
        {/* restrictToVerticalAxis：拖拽时把位移限制为竖直方向，列表只能上下重排 */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-0.5 mt-1">
              {projects.map((project) => {
                const isActive = project.id === activeProjectId;
                const isEditing = editingId === project.id;

                return (
                  <SortableProjectItem
                    key={project.id}
                    project={project}
                    isActive={isActive}
                    isEditing={isEditing}
                    editName={editName}
                    incompleteCount={incompleteCounts[project.id] ?? 0}
                    onSwitch={onSwitch}
                    onEditNameChange={setEditName}
                    onConfirmRename={handleConfirmRename}
                    onCancelRename={() => setEditingId(null)}
                    onContextMenu={handleItemContextMenu}
                    onNewTodo={(p) => onNewTodoInProject(p.id)}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* 底部更新状态与品牌签名 */}
      <div className="relative px-3 pb-3 pt-2">
        <SidebarUpdateCard
          status={updateStatus}
          info={updateInfo}
          progress={updateProgress}
          isNewlyAvailable={isNewlyAvailable}
          onDownload={onDownloadUpdate}
          onRestart={onRestartToUpdate}
        />

        <AnimatePresence>
          {settingsMenuOpen && (
            <motion.div
              ref={settingsMenuRef}
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.14 }}
              className="absolute bottom-12 left-3 right-3 z-30 rounded-xl border p-1.5"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                borderColor: 'var(--border-color)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              {[
                {
                  label: '设置',
                  icon: SettingsIcon,
                  onSelect: () => onOpenSettings('general'),
                },
                {
                  label: '已归档事项',
                  icon: InboxIcon,
                  onSelect: () => onOpenHistory(),
                },
                {
                  label: '帮助与反馈',
                  icon: GithubIcon,
                  onSelect: () => onOpenHelp(),
                },
              ].map(({ label, icon: Icon, onSelect }) => (
                <button
                  key={label}
                  onClick={() => {
                    setSettingsMenuOpen(false);
                    onSelect();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-[var(--bg-hover)]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          ref={settingsButtonRef}
          onClick={() => setSettingsMenuOpen((value) => !value)}
          className="mt-2 flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-[var(--bg-active)]"
          style={{ color: 'var(--text-primary)' }}
          aria-label="打开设置菜单"
          aria-expanded={settingsMenuOpen}
        >
          <Logo size={22} />
          <span
            className="brand-wordmark flex flex-1 items-center gap-[0.35em] whitespace-nowrap text-left"
            style={{ color: 'var(--text-primary)' }}
          >
            <span className="italic">Celery</span>
            <span
              aria-hidden="true"
              className="w-[5px] h-[5px] rounded-full flex-shrink-0"
              style={{ backgroundColor: 'var(--accent)' }}
            />
            <span>Todo</span>
          </span>
        </button>
      </div>

      {/* 删除确认对话框 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除项目"
        message={`确定要删除项目「${deleteTarget?.name}」吗？该项目下的所有事项将移入归档（历史记录），可在历史记录页恢复或永久删除。`}
        confirmText="删除"
        danger
        onConfirm={() => {
          if (deleteTarget) onDelete(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* 项目项右键菜单：替代原 hover 三按钮 */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenuItems}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </aside>
  );
}

export const ProjectSidebar = memo(ProjectSidebarComponent);
