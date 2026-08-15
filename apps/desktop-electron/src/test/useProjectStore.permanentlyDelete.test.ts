import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../types';

// 显式列出 store 在 permanentlyDeleteProject 路径上会触发的所有 data.* 调用，
// 漏一个就会让未 mock 的真实实现落到 sql.js WASM 上、测试崩溃。
vi.mock('../utils/dataGateway', () => ({
  permanentlyDeleteProject: vi.fn().mockResolvedValue(undefined),
  deleteSetting: vi.fn().mockResolvedValue(undefined),
}));

const dataModule = await import('../utils/dataGateway');
const data = {
  permanentlyDeleteProject: vi.mocked(dataModule.permanentlyDeleteProject),
  deleteSetting: vi.mocked(dataModule.deleteSetting),
};
const { useProjectStore } = await import('../store/useProjectStore');

const userProject: Project = {
  id: 'p-user',
  name: '用户项目',
  kind: 'user',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  order: 1,
};
const inboxProject: Project = {
  id: 'p-inbox',
  name: '收集箱',
  kind: 'inbox',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  order: 0,
};
const otherProject: Project = {
  id: 'p-other',
  name: '另一个项目',
  kind: 'user',
  createdAt: '2026-08-02T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
  order: 2,
};

function seedProjects(projects: Project[], activeProjectId = projects[0]?.id ?? '') {
  useProjectStore.setState({ projects, activeProjectId });
}

describe('useProjectStore.permanentlyDeleteProject', () => {
  beforeEach(() => {
    data.permanentlyDeleteProject.mockClear();
    data.deleteSetting.mockClear();
  });

  it('调用 data.permanentlyDeleteProject 并从 projects 移除该项目建设', async () => {
    seedProjects([otherProject, userProject], userProject.id);

    await useProjectStore.getState().permanentlyDeleteProject(userProject.id);

    expect(data.permanentlyDeleteProject).toHaveBeenCalledTimes(1);
    expect(data.permanentlyDeleteProject).toHaveBeenCalledWith(userProject.id);
    expect(useProjectStore.getState().projects.map((p) => p.id)).toEqual([otherProject.id]);
  });

  it('清理该项目对应的 filter./sort./celebrated. settings 键', async () => {
    seedProjects([otherProject, userProject]);

    await useProjectStore.getState().permanentlyDeleteProject(userProject.id);

    const keys = data.deleteSetting.mock.calls.map((c) => c[0]);
    expect(keys).toEqual(
      expect.arrayContaining([
        `filter.${userProject.id}`,
        `sort.${userProject.id}`,
        `celebrated.${userProject.id}`,
      ]),
    );
    expect(data.deleteSetting).toHaveBeenCalledTimes(3);
  });

  it('若删除的是当前激活项目，回退到剩余项目的第一个', async () => {
    seedProjects([otherProject, userProject], userProject.id);

    await useProjectStore.getState().permanentlyDeleteProject(userProject.id);

    expect(useProjectStore.getState().activeProjectId).toBe(otherProject.id);
  });

  it('删的是非激活项目时不改变 activeProjectId', async () => {
    seedProjects([otherProject, userProject], otherProject.id);

    await useProjectStore.getState().permanentlyDeleteProject(userProject.id);

    expect(useProjectStore.getState().activeProjectId).toBe(otherProject.id);
  });

  it('删除最后一个项目后 activeProjectId 为空串', async () => {
    seedProjects([userProject], userProject.id);

    await useProjectStore.getState().permanentlyDeleteProject(userProject.id);

    expect(useProjectStore.getState().activeProjectId).toBe('');
    expect(useProjectStore.getState().projects).toEqual([]);
  });

  it('对收集箱项目抛错且不调用 data 层', async () => {
    seedProjects([inboxProject, userProject]);

    await expect(
      useProjectStore.getState().permanentlyDeleteProject(inboxProject.id),
    ).rejects.toThrow('收集箱不能删除');
    expect(data.permanentlyDeleteProject).not.toHaveBeenCalled();
    expect(data.deleteSetting).not.toHaveBeenCalled();
    // 收集箱仍保留
    expect(useProjectStore.getState().projects.map((p) => p.id)).toContain(inboxProject.id);
  });
});
