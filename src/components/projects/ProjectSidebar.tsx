/**
 * @file ProjectSidebar - 项目侧边栏
 * @description 项目列表、创建/删除/重命名项目、导入导出，支持拖拽排序
 */

import { memo, useState, useCallback, useEffect, useRef } from 'react';
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
import { CSS } from '@dnd-kit/utilities';
import type { Project } from '../../types';
import {
  PlusIcon,
  TrashIcon,
  EditIcon,
  DownloadIcon,
  UploadIcon,
  RecycleIcon,
  SettingsIcon,
} from '../common/Icons';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Logo } from '../common/Logo';

interface ProjectSidebarProps {
  projects: Project[];
  activeProjectId: string;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onExport: (projectId: string) => void;
  onImport: (file: File) => void;
  onReorder: (sourceId: string, targetId: string) => void;
  onOpenRecycleBin: () => void;
  onOpenSettings: () => void;
  recycleBinCount: number;
  /** 外部触发「新建项目」输入框聚焦：值变化时唤出并聚焦输入框 */
  autofocusCreateSignal?: number;
}

/** 单个项目行（包装为 dnd-kit 可拖动节点） */
interface SortableProjectItemProps {
  project: Project;
  isActive: boolean;
  isEditing: boolean;
  editName: string;
  onSwitch: (id: string) => void;
  onEditNameChange: (value: string) => void;
  onConfirmRename: () => void;
  onCancelRename: () => void;
  onStartRename: (project: Project) => void;
  onExport: (id: string) => void;
  onDelete: (project: Project) => void;
}

function SortableProjectItem({
  project,
  isActive,
  isEditing,
  editName,
  onSwitch,
  onEditNameChange,
  onConfirmRename,
  onCancelRename,
  onStartRename,
  onExport,
  onDelete,
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
    backgroundColor: isActive ? 'var(--accent-subtle)' : 'transparent',
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative rounded-md transition-colors">
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
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left rounded-md cursor-grab active:cursor-grabbing"
          style={{
            color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
            fontWeight: isActive ? 500 : 400,
          }}
          aria-label={`${project.name}（拖动以排序）`}
        >
          <span className="flex-1 truncate">{project.name}</span>
        </button>
      )}

      {/* 悬浮操作按钮 */}
      {!isEditing && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExport(project.id);
            }}
            className="p-1 rounded hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label="导出项目"
          >
            <DownloadIcon size={13} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartRename(project);
            }}
            className="p-1 rounded hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label="重命名"
          >
            <EditIcon size={13} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(project);
            }}
            className="p-1 rounded hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label="删除项目"
          >
            <TrashIcon size={13} />
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
  onImport,
  onReorder,
  onOpenRecycleBin,
  onOpenSettings,
  recycleBinCount,
  autofocusCreateSignal,
}: ProjectSidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

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

  const handleImportClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) onImport(file);
    };
    input.click();
  }, [onImport]);

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
      className="w-64 flex-shrink-0 h-full flex flex-col border-r"
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
    >
      {/* Logo / 标题 - 与右侧 Header 项目名保持同字号、同上下间距，视觉对齐 */}
      <div className="px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Logo size={36} className="flex-shrink-0" />
          <h1
            className="text-xl font-serif tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Celery Todo
          </h1>
        </div>
      </div>

      {/* 项目列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
            项目
          </span>
          <button
            onClick={() => setIsCreating(true)}
            className="btn-ghost p-1"
            aria-label="新建项目"
          >
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
                    onSwitch={onSwitch}
                    onEditNameChange={setEditName}
                    onConfirmRename={handleConfirmRename}
                    onCancelRename={() => setEditingId(null)}
                    onStartRename={handleStartRename}
                    onExport={onExport}
                    onDelete={setDeleteTarget}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* 底部操作 */}
      <div
        className="px-3 py-3 border-t space-y-0.5"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <button
          onClick={handleImportClick}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: 'var(--text-secondary)' }}
        >
          <UploadIcon size={15} />
          导入数据
        </button>
        <button
          onClick={onOpenRecycleBin}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: 'var(--text-secondary)' }}
        >
          <RecycleIcon size={15} />
          <span className="flex-1 text-left">回收站</span>
          {recycleBinCount > 0 && (
            <span
              className="text-[11px] font-medium px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
              style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}
            >
              {recycleBinCount}
            </span>
          )}
        </button>
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: 'var(--text-secondary)' }}
        >
          <SettingsIcon size={15} />
          设置
        </button>
      </div>

      {/* 删除确认对话框 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除项目"
        message={`确定要删除项目「${deleteTarget?.name}」吗？该项目下的所有事项将移入回收站，30 天后自动清除。`}
        confirmText="删除"
        danger
        onConfirm={() => {
          if (deleteTarget) onDelete(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </aside>
  );
}

export const ProjectSidebar = memo(ProjectSidebarComponent);
