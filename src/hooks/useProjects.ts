/**
 * @file useProjects - 项目管理 Hook
 */

import { useCallback } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import type { Project } from '../types';

export function useProjects() {
  const store = useProjectStore();

  const createProject = useCallback(
    async (name: string, color?: string): Promise<string> => {
      return store.createProject(name, color);
    },
    [store],
  );

  const renameProject = useCallback(
    (id: string, name: string) => {
      store.renameProject(id, name);
    },
    [store],
  );

  const deleteProject = useCallback(
    (id: string) => store.deleteProject(id),
    [store],
  );

  // 永久删除（硬删除）。与 deleteProject 一样返回 Promise，让调用方（侧栏
  // ConfirmDialog 的 safeRun）能 catch 主进程事务失败（磁盘满 / 锁竞争 /
  // inbox 守卫），避免出现「确认框关闭但项目没删成」的静默状态。
  // 详见 4c093e3 对 TimeView 同类静默吞错的修复。
  const permanentlyDeleteProject = useCallback(
    (id: string) => store.permanentlyDeleteProject(id),
    [store],
  );

  const switchProject = useCallback(
    (id: string) => {
      store.setActiveProject(id);
    },
    [store],
  );

  const reorderProjects = useCallback(
    (sourceId: string, targetId: string) => {
      store.reorderProjects(sourceId, targetId);
    },
    [store],
  );

  const activeProject: Project | undefined = store.projects.find(
    (p) => p.id === store.activeProjectId,
  );

  return {
    projects: store.projects,
    activeProjectId: store.activeProjectId,
    activeProject,
    createProject,
    renameProject,
    deleteProject,
    permanentlyDeleteProject,
    switchProject,
    reorderProjects,
    loadProjects: store.loadProjects,
  };
}
