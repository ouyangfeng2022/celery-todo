/**
 * @file Project Store - 项目状态管理
 * @description 管理项目列表的增删改查、切换、导入导出
 */

import { create } from 'zustand';
import type { Project } from '../types';
import * as data from '../utils/dataGateway';
import { generateId } from '../utils/helpers';

interface ProjectState {
  /** 项目列表 */
  projects: Project[];
  /** 当前激活的项目 ID */
  activeProjectId: string;
  /** 加载项目列表 */
  loadProjects: () => Promise<void>;
  /** 创建项目 */
  createProject: (name: string, color?: string) => Promise<string>;
  /** 重命名项目 */
  renameProject: (id: string, name: string) => Promise<void>;
  /** 删除项目 */
  deleteProject: (id: string) => Promise<void>;
  /** 切换当前项目 */
  setActiveProject: (id: string) => void;
  /** 拖拽排序：把 source 移到 target 的位置 */
  reorderProjects: (sourceId: string, targetId: string) => Promise<void>;
  /** 获取当前项目 */
  getActiveProject: () => Project | undefined;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  // 空串表示「无激活项目」：首次启动时项目列表为空，不再自动创建默认项目。
  activeProjectId: '',

  loadProjects: async () => {
    // 仅同步 DB 现状，不自动创建任何项目；项目列表允许为空。
    const projects = await data.getProjects();
    set({ projects });
  },

  createProject: async (name, color) => {
    const now = new Date().toISOString();
    // order 传 null：由 db.insertProject 用 MAX(sort_order)+1 自动追加到末尾。
    const project: Project = {
      id: generateId(),
      name: name.trim(),
      kind: 'user',
      color: color || undefined,
      createdAt: now,
      updatedAt: now,
      order: 0,
    };
    await data.insertProject(project);
    // 重新拉一次以拿到 DB 实际分配的 sort_order，避免本地 order=0 与实际不符。
    const inserted = (await data.getProject(project.id)) ?? project;
    // 创建后自动切换为当前项目，符合「新建即进入」的预期；
    // activeProjectId 变化会驱动 App.tsx 中的 effect 重新 loadProject。
    // 主进程会把提交事件也广播给发起窗口。事件可能在 IPC Promise 返回前完成
    // 项目列表刷新；这里按 id 去重，避免「事件刷新 + 本地成功态」重复插入一行。
    set({
      projects: [...get().projects.filter((item) => item.id !== project.id), inserted],
      activeProjectId: project.id,
    });
    return project.id;
  },

  renameProject: async (id, name) => {
    const project = get().projects.find((p) => p.id === id);
    if (!project) return;
    if (project.kind === 'inbox') throw new Error('收集箱不能重命名');
    const updated: Project = {
      ...project,
      name: name.trim(),
      updatedAt: new Date().toISOString(),
    };
    await data.updateProject(updated);
    set({ projects: get().projects.map((p) => (p.id === id ? updated : p)) });
  },

  deleteProject: async (id) => {
    if (get().projects.find((project) => project.id === id)?.kind === 'inbox') {
      throw new Error('收集箱不能删除');
    }
    await data.deleteProject(id);
    // 清理该项目对应的 per-project settings 键，避免 settings 表长期堆积无主键。
    // `filter.`/`sort.` 由 useFilter 写入；`celebrated.` 由 App.tsx 庆祝逻辑写入。
    await Promise.all([
      data.deleteSetting(`filter.${id}`),
      data.deleteSetting(`sort.${id}`),
      data.deleteSetting(`celebrated.${id}`),
    ]);
    const projects = get().projects.filter((p) => p.id !== id);
    set({ projects });
    // 如果删除的是当前项目，回退到剩余项目的第一个（可能为空串，表示无激活项目）
    if (get().activeProjectId === id) {
      set({ activeProjectId: projects[0]?.id ?? '' });
    }
  },

  reorderProjects: async (sourceId, targetId) => {
    const { projects } = get();
    if (sourceId === targetId) return;
    if (
      projects.some(
        (project) =>
          project.kind === 'inbox' && (project.id === sourceId || project.id === targetId),
      )
    )
      return;
    const sourceIdx = projects.findIndex((p) => p.id === sourceId);
    const targetIdx = projects.findIndex((p) => p.id === targetId);
    if (sourceIdx === -1 || targetIdx === -1) return;

    // 普通拖拽只写被移动项目的稀疏 rank；间隔耗尽时数据库内部才重编号。
    set({ projects: await data.moveProjectRank(sourceId, targetId) });
  },

  setActiveProject: (id) => {
    set({ activeProjectId: id });
  },

  getActiveProject: () => {
    const { projects, activeProjectId } = get();
    return projects.find((p) => p.id === activeProjectId);
  },
}));
