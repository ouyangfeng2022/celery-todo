/**
 * @file ProjectSidebar - 项目侧边栏
 * @description 项目列表、创建/删除/重命名项目、导入导出
 */

import { memo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Project } from '../../types';
import { PlusIcon, TrashIcon, EditIcon, DownloadIcon, UploadIcon, FolderIcon, RecycleIcon, SettingsIcon } from '../common/Icons';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface ProjectSidebarProps {
  projects: Project[];
  activeProjectId: string;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onExport: (projectId: string) => void;
  onImport: (file: File) => void;
  onOpenRecycleBin: () => void;
  onOpenSettings: () => void;
  recycleBinCount: number;
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
  onOpenRecycleBin,
  onOpenSettings,
  recycleBinCount,
}: ProjectSidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

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

  return (
    <aside
      className="w-64 flex-shrink-0 h-full flex flex-col border-r"
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
    >
      {/* Logo / 标题 */}
      <div className="px-4 py-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" strokeWidth={3}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-lg font-serif" style={{ color: 'var(--text-primary)' }}>
            Celery Todo
          </h1>
        </div>
      </div>

      {/* 项目列表 */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
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
              className="px-2 mb-2 overflow-hidden"
            >
              <input
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
                className="w-full px-2 py-1.5 text-sm rounded-md border-none outline-none"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 项目项 */}
        <div className="space-y-0.5">
          {projects.map((project) => {
            const isActive = project.id === activeProjectId;
            const isEditing = editingId === project.id;
            const isDefault = project.id === 'default';

            return (
              <div
                key={project.id}
                className="group relative rounded-md transition-colors"
                style={{
                  backgroundColor: isActive ? 'var(--accent-light)' : 'transparent',
                }}
              >
                {isEditing ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmRename();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onBlur={handleConfirmRename}
                    autoFocus
                    className="w-full px-3 py-2 text-sm rounded-md border-none outline-none"
                    style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                    }}
                  />
                ) : (
                  <button
                    onClick={() => onSwitch(project.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left"
                    style={{
                      color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    <FolderIcon size={16} />
                    <span className="flex-1 truncate">{project.name}</span>
                    {isDefault && (
                      <span className="text-xs px-1.5 py-0.5 rounded group-hover:opacity-0 transition-opacity" style={{ backgroundColor: 'var(--bg-hover)' }}>
                        默认
                      </span>
                    )}
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
                      <DownloadIcon size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartRename(project);
                      }}
                      className="p-1 rounded hover:bg-[var(--bg-hover)]"
                      style={{ color: 'var(--text-tertiary)' }}
                      aria-label="重命名"
                    >
                      <EditIcon size={14} />
                    </button>
                    {!isDefault && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(project);
                        }}
                        className="p-1 rounded hover:bg-[var(--bg-hover)]"
                        style={{ color: 'var(--text-tertiary)' }}
                        aria-label="删除项目"
                      >
                        <TrashIcon size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 回收站 */}
        <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <button
            onClick={onOpenRecycleBin}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-secondary)' }}
          >
            <RecycleIcon size={16} />
            <span className="flex-1 text-left">回收站</span>
            {recycleBinCount > 0 && (
              <span
                className="text-xs px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}
              >
                {recycleBinCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 底部操作 */}
      <div className="px-2 py-3 border-t space-y-1" style={{ borderColor: 'var(--border-color)' }}>
        <button
          onClick={handleImportClick}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: 'var(--text-secondary)' }}
        >
          <UploadIcon size={16} />
          导入数据
        </button>
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: 'var(--text-secondary)' }}
        >
          <SettingsIcon size={16} />
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
