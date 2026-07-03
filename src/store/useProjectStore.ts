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
  /** 获取当前项目 */
  getActiveProject: () => Project | undefined;
}

/** 默认项目 ID */
export const DEFAULT_PROJECT_ID = 'default';

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProjectId: DEFAULT_PROJECT_ID,

  loadProjects: () => {
    let projects = db.getAllProjects();
    // 确保默认项目存在
    if (projects.length === 0) {
      const now = new Date().toISOString();
      const defaultProject: Project = {
        id: DEFAULT_PROJECT_ID,
        name: '默认项目',
        createdAt: now,
        updatedAt: now,
      };
      db.insertProject(defaultProject);
      projects = [defaultProject];
    } else if (!projects.find((p) => p.id === DEFAULT_PROJECT_ID)) {
      // 如果没有默认项目，创建一个
      const now = new Date().toISOString();
      const defaultProject: Project = {
        id: DEFAULT_PROJECT_ID,
        name: '默认项目',
        createdAt: now,
        updatedAt: now,
      };
      db.insertProject(defaultProject);
      projects = [defaultProject, ...projects];
    }
    set({ projects });
  },

  createProject: (name, color) => {
    const now = new Date().toISOString();
    const project: Project = {
      id: generateId(),
      name: name.trim(),
      color: color || undefined,
      createdAt: now,
      updatedAt: now,
    };
    db.insertProject(project);
    set({ projects: [...get().projects, project] });
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
    if (id === DEFAULT_PROJECT_ID) return; // 不能删除默认项目
    db.deleteProject(id);
    const projects = get().projects.filter((p) => p.id !== id);
    set({ projects });
    // 如果删除的是当前项目，切换到默认项目
    if (get().activeProjectId === id) {
      set({ activeProjectId: DEFAULT_PROJECT_ID });
    }
  },

  setActiveProject: (id) => {
    set({ activeProjectId: id });
  },

  getActiveProject: () => {
    const { projects, activeProjectId } = get();
    return projects.find((p) => p.id === activeProjectId);
  },
}));
