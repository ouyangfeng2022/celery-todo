/**
 * @file useProjects - 项目管理 Hook
 */

import { useCallback } from 'react';
import { useProjectStore, DEFAULT_PROJECT_ID } from '../store/useProjectStore';
import type { Project } from '../types';

export function useProjects() {
  const store = useProjectStore();

  const createProject = useCallback(
    (name: string, color?: string): string => {
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
    (id: string) => {
      if (id === DEFAULT_PROJECT_ID) return;
      store.deleteProject(id);
    },
    [store],
  );

  const switchProject = useCallback(
    (id: string) => {
      store.setActiveProject(id);
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
    switchProject,
    loadProjects: store.loadProjects,
  };
}
