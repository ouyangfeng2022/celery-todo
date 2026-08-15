/**
 * @file 导入导出流程
 * @description 从 App.tsx 拆出：JSON / Excel / 图片导出、v2 JSON 导入、恢复出厂。
 *              导出文件经浏览器下载通道落盘（WebView2 下载条）；
 *              阶段 B 换原生保存对话框 + 真实路径回执。
 */

import { useCallback, useState } from 'react';
import {
  EXPORT_FORMAT_VERSION,
  createTodosExcel,
  exportAppAsJson,
  exportHistoryAsJson,
  exportProjectAsJson,
  parseImportData,
} from '../utils/export';
import { downloadBlob, downloadFile, readFileAsText } from '../utils/helpers';
import * as data from '../utils/dataGateway';
import { useProjectStore } from '../store/useProjectStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTimeViewStore } from '../store/useTimeViewStore';
import { useTodoStore } from '../store/useTodoStore';
import { setAutoStart as setAutoStartHost } from '../platform';
import type { Project, Todo } from '../types';
import type { ExportRequest, ExportScope } from '../components/export/ExportDialog';

interface UseExportImportOptions {
  projects: Project[];
  createProject: (name: string) => Promise<string>;
  switchProject: (id: string) => void;
  loadProjects: () => Promise<void>;
}

export function useExportImport({
  projects,
  createProject,
  switchProject,
  loadProjects,
}: UseExportImportOptions) {
  // === 导出为图片：打开预览弹窗；项目元信息 + 全量 todos 在打开瞬间拍快照 ===
  const [exportImageTarget, setExportImageTarget] = useState<{
    project: Project;
    todos: Todo[];
    autoExport?: boolean;
  } | null>(null);

  // === 统一导出选项卡片 ===
  const [exportDialogTarget, setExportDialogTarget] = useState<{
    scope: ExportScope;
    projectId?: string;
  } | null>(null);

  // === 导出数据预览（JSON 文本 / Excel 工作簿前确认） ===
  const [exportDataPreviewTarget, setExportDataPreviewTarget] = useState<{
    request: ExportRequest;
    projects: Project[];
    projectTodos: Record<string, Todo[]>;
    jsonPreview: string;
  } | null>(null);

  const openExportDialog = useCallback((projectId?: string) => {
    setExportDialogTarget({ scope: projectId ? 'project' : 'all', projectId });
  }, []);

  const handleExportProject = useCallback(
    async (projectId: string) => {
      const project = projects.find((p) => p.id === projectId);
      if (!project) return;
      const [projectTodos, projectDeleted] = await Promise.all([
        data.getTodos(projectId),
        data.getDeletedTodos(projectId),
      ]);
      const json = exportProjectAsJson(project, projectTodos, projectDeleted);
      downloadFile(json, `Celery-Todo-${project.name}.json`);
    },
    [projects],
  );

  const handleExportAll = useCallback(async () => {
    const exported = await data.exportAll();
    const json = exportAppAsJson(exported);
    downloadFile(json, `Celery-Todo-All-${new Date().toISOString().split('T')[0]}.json`);
  }, []);

  // 按项目导出 Excel：不依赖当前已加载的 todos，直接查指定项目。
  const handleExportExcelForProject = useCallback(
    async (projectId: string) => {
      const project = projects.find((p) => p.id === projectId);
      if (!project) return;
      const content = await createTodosExcel([
        { projectName: project.name, todos: await data.getTodos(projectId) },
      ]);
      downloadBlob(
        new Blob([content], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        `Celery-Todo-${project.name}.xlsx`,
      );
    },
    [projects],
  );

  // 全量 Excel：每个项目写入一个同名工作表。
  const handleExportAllExcel = useCallback(async () => {
    const content = await createTodosExcel(
      await Promise.all(
        projects.map(async (project) => ({
          projectName: project.name,
          todos: await data.getTodos(project.id),
        })),
      ),
    );
    downloadBlob(
      new Blob([content], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `Celery-Todo-All-${new Date().toISOString().split('T')[0]}.xlsx`,
    );
  }, [projects]);

  // 导出历史记录（归档）为独立 JSON 快照。跨项目全量，按归档时间倒序。
  // 注意：这是只读备份，刻意不被 parseImportData 识别，不可导回。
  const handleExportHistory = useCallback(async () => {
    const archivedTodos = await data.getAllDeletedTodos();
    // 仅保留归档事项涉及的项目，避免把无关项目名也写进快照
    const usedIds = new Set(archivedTodos.map((t) => t.projectId));
    const projectNames: Record<string, string> = {};
    for (const p of projects) {
      if (usedIds.has(p.id)) projectNames[p.id] = p.name;
    }
    // 项目本身已归档时，从事项携带的名称快照补齐映射。
    for (const todo of archivedTodos) {
      if (!projectNames[todo.projectId] && todo.projectName) {
        projectNames[todo.projectId] = todo.projectName;
      }
    }
    const json = exportHistoryAsJson({
      version: EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      kind: 'celery-todo-history',
      archivedTodos,
      projectNames,
    });
    downloadFile(json, `Celery-Todo-Archive-${new Date().toISOString().split('T')[0]}.json`);
  }, [projects]);

  const handleExportImage = useCallback(
    async (projectId: string, autoExport = false) => {
      const project = projects.find((p) => p.id === projectId);
      if (!project) return;
      const projectTodos = await data.getTodos(projectId);
      setExportImageTarget({ project, todos: projectTodos, autoExport });
    },
    [projects],
  );

  // 设置页「导出项目」对话框的统一分发：根据格式转给对应处理函数。
  const handleExportProjectWithFormat = useCallback(
    (projectId: string, format: 'json' | 'excel' | 'image') => {
      if (format === 'json') void handleExportProject(projectId);
      else if (format === 'image') void handleExportImage(projectId);
      else void handleExportExcelForProject(projectId);
    },
    [handleExportProject, handleExportImage, handleExportExcelForProject],
  );

  const handleExportRequest = useCallback(
    async ({ scope, projectId, format }: ExportRequest) => {
      if (format === 'image') {
        void handleExportImage(projectId);
        return;
      }

      const previewProjects =
        scope === 'all' ? projects : projects.filter((project) => project.id === projectId);
      const projectTodos = Object.fromEntries(
        await Promise.all(
          previewProjects.map(async (project) => [project.id, await data.getTodos(project.id)]),
        ),
      );
      const jsonPreview =
        scope === 'all'
          ? exportAppAsJson(await data.exportAll())
          : previewProjects[0]
            ? exportProjectAsJson(
                previewProjects[0],
                projectTodos[previewProjects[0].id],
                await data.getDeletedTodos(previewProjects[0].id),
              )
            : '{}';
      setExportDataPreviewTarget({
        request: { scope, projectId, format },
        projects: previewProjects,
        projectTodos,
        jsonPreview,
      });
    },
    [handleExportImage, projects],
  );

  const handleDirectExportRequest = useCallback(
    ({ scope, projectId, format }: ExportRequest) => {
      if (scope === 'all') {
        if (format === 'excel') void handleExportAllExcel();
        else void handleExportAll();
        return;
      }
      if (format === 'image') {
        void handleExportImage(projectId, true);
        return;
      }
      handleExportProjectWithFormat(projectId, format);
    },
    [handleExportAll, handleExportAllExcel, handleExportImage, handleExportProjectWithFormat],
  );

  // === 导入（v2 JSON；2.x 壳导出的备份可直接导入） ===
  const handleImportProject = useCallback(
    async (file: File) => {
      try {
        const text = await readFileAsText(file);
        const imported = parseImportData(text);
        if ('project' in imported) {
          // 导入单个项目
          const newId = await createProject(imported.project.name);
          await data.insertTodos(
            imported.todos.map((t) => ({ ...t, id: crypto.randomUUID(), projectId: newId })),
          );
          await useTodoStore.getState().loadProject(newId);
          switchProject(newId);
        } else {
          // 导入完整应用数据（Rust 单事务全量替换）
          await data.replaceAll(imported);
          await loadProjects();
          await useSettingsStore.getState().loadSettings();
          // autoStart 同时存在于 SQLite 设置和操作系统登录项；全量导入恢复了前者，
          // 这里同步后者（阶段 B 前为 no-op），避免设置面板与系统实际状态不一致。
          setAutoStartHost(useSettingsStore.getState().autoStart);
          // 导入后优先恢复备份中的上次活跃项目；该项目不存在或旧备份没有该设置时，
          // 再回退到第一个项目。不能沿用导入前的 activeProjectId，否则偶发同 ID
          // 命中时会把旧会话状态带进新数据集。
          const store = useProjectStore.getState();
          const importedLastId = useSettingsStore.getState().lastActiveProjectId;
          const targetId = store.projects.some((p) => p.id === importedLastId)
            ? importedLastId
            : (store.projects[0]?.id ?? '');
          if (store.activeProjectId !== targetId) {
            store.setActiveProject(targetId);
          }
          await useTodoStore.getState().loadProject(targetId);
          await useTimeViewStore.getState().load();
        }
      } catch (err) {
        alert(`导入失败: ${err instanceof Error ? err.message : '未知错误'}`);
      }
    },
    [createProject, switchProject, loadProjects],
  );

  // === 恢复出厂 ===
  const handleResetData = useCallback(async () => {
    await data.reset();
    await useProjectStore.getState().loadProjects();
    // 重置后项目列表为空，activeProjectId 为空串；清空当前 todo 视图
    await useTodoStore.getState().loadProject(useProjectStore.getState().activeProjectId);
    await useSettingsStore.getState().loadSettings();
    await useTimeViewStore.getState().load();
  }, []);

  return {
    // 状态（弹窗挂载目标）
    exportImageTarget,
    exportDialogTarget,
    exportDataPreviewTarget,
    setExportDialogTarget,
    setExportImageTarget,
    setExportDataPreviewTarget,
    // 动作
    openExportDialog,
    handleExportProject,
    handleExportAll,
    handleExportExcelForProject,
    handleExportAllExcel,
    handleExportHistory,
    handleExportProjectWithFormat,
    handleExportRequest,
    handleDirectExportRequest,
    handleImportProject,
    handleResetData,
  };
}
