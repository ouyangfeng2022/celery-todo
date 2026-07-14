/**
 * @file Project Store - 项目状态管理
 * @description 管理项目列表的增删改查、切换、导入导出
 */

import { create } from 'zustand';
import type { Project } from '../types';
import * as db from '../utils/database';
import { generateId } from '../utils/helpers';

interface ProjectState {
  /** 项目列表 */
  projects: Project[];
  /** 当前激活的项目 ID */
  activeProjectId: string;
  /** 加载项目列表 */
  loadProjects: () => void;
  /** 创建项目 */
  createProject: (name: string, color?: string) => string;
  /** 重命名项目 */
  renameProject: (id: string, name: string) => void;
  /** 删除项目 */
  deleteProject: (id: string) => void;
  /** 切换当前项目 */
  setActiveProject: (id: string) => void;
  /** 拖拽排序：把 source 移到 target 的位置 */
  reorderProjects: (sourceId: string, targetId: string) => void;
  /** 获取当前项目 */
  getActiveProject: () => Project | undefined;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  // 空串表示「无激活项目」：首次启动时项目列表为空，不再自动创建默认项目。
  activeProjectId: '',

  loadProjects: () => {
    // 仅同步 DB 现状，不自动创建任何项目；项目列表允许为空。
    const projects = db.getAllProjects();
    set({ projects });
  },

  createProject: (name, color) => {
    const now = new Date().toISOString();
    // order 传 null：由 db.insertProject 用 MAX(sort_order)+1 自动追加到末尾。
    const project: Project = {
      id: generateId(),
      name: name.trim(),
      color: color || undefined,
      createdAt: now,
      updatedAt: now,
      order: 0,
    };
    db.insertProject(project);
    // 重新拉一次以拿到 DB 实际分配的 sort_order，避免本地 order=0 与实际不符。
    const inserted = db.getProjectById(project.id) ?? project;
    // 创建后自动切换为当前项目，符合「新建即进入」的预期；
    // activeProjectId 变化会驱动 App.tsx 中的 effect 重新 loadProject。
    set({ projects: [...get().projects, inserted], activeProjectId: project.id });
    return project.id;
  },

  renameProject: (id, name) => {
    const project = get().projects.find((p) => p.id === id);
    if (!project) return;
    const updated: Project = {
      ...project,
      name: name.trim(),
      updatedAt: new Date().toISOString(),
    };
    db.updateProject(updated);
    set({ projects: get().projects.map((p) => (p.id === id ? updated : p)) });
  },

  deleteProject: (id) => {
    db.deleteProject(id);
    // 清理该项目对应的 per-project settings 键，避免 settings 表长期堆积无主键。
    // `filter.`/`sort.` 由 useFilter 写入；`celebrated.` 由 App.tsx 庆祝逻辑写入。
    db.deleteSetting(`filter.${id}`);
    db.deleteSetting(`sort.${id}`);
    db.deleteSetting(`celebrated.${id}`);
    const projects = get().projects.filter((p) => p.id !== id);
    set({ projects });
    // 如果删除的是当前项目，回退到剩余项目的第一个（可能为空串，表示无激活项目）
    if (get().activeProjectId === id) {
      set({ activeProjectId: projects[0]?.id ?? '' });
    }
  },

  reorderProjects: (sourceId, targetId) => {
    const { projects } = get();
    if (sourceId === targetId) return;
    const sourceIdx = projects.findIndex((p) => p.id === sourceId);
    const targetIdx = projects.findIndex((p) => p.id === targetId);
    if (sourceIdx === -1 || targetIdx === -1) return;

    // 重新排列数组（与 useTodoStore.reorderTodos 一致的算法）
    const next = [...projects];
    const [moved] = next.splice(sourceIdx, 1);
    next.splice(targetIdx, 0, moved);

    // 按数组下标重分配 order 并持久化
    const reordered = next.map((p, idx) => ({ ...p, order: idx }));
    db.reorderProjects(reordered.map((p) => p.id));
    set({ projects: reordered });
  },

  setActiveProject: (id) => {
    set({ activeProjectId: id });
  },

  getActiveProject: () => {
    const { projects, activeProjectId } = get();
    return projects.find((p) => p.id === activeProjectId);
  },
}));
