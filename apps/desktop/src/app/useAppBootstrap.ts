/**
 * @file 应用启动流程
 * @description 初始化顺序（与 2.x 一致）：
 *              settings → projects → 恢复上次活跃项目 → 当前项目 todos → 时间视图。
 *              3.0 新增首启分支：v3 库为空且探测到 2.x 数据时，先展示导入横幅。
 */

import { useCallback, useEffect, useState } from 'react';
import type { LegacyV2Report } from '@celery/data';
import { useProjectStore } from '../store/useProjectStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTimeViewStore } from '../store/useTimeViewStore';
import { useTodoStore } from '../store/useTodoStore';
import { createLegacyV2ImportService, createTauriRepositories } from '../lib/tauri-repositories';

const repos = createTauriRepositories();
const legacy = createLegacyV2ImportService();

/** 首启导入向导状态：仅在空库且探测到 2.x 数据时进入 offer。 */
export type MigrationOfferState =
  { status: 'pending' } | { status: 'offer'; report: LegacyV2Report } | { status: 'none' };

export function useAppBootstrap() {
  const [dbReady, setDbReady] = useState(false);
  const [offer, setOffer] = useState<MigrationOfferState>({ status: 'pending' });
  const [importing, setImporting] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);

  const finishBoot = useCallback(async () => {
    await useSettingsStore.getState().loadSettings();
    await useProjectStore.getState().loadProjects();
    // 启动时恢复上次激活的项目：
    //   1) 读持久化的 lastActiveProjectId，若该项目仍在列表中 → 恢复；
    //   2) 否则回退到列表第一个项目（若有）；
    //   3) 列表为空时保持初始 ''，主区显示「请创建项目」。
    // loadSettings 必须在 loadProjects 之前调用，这里才能拿到 lastActiveProjectId。
    const lastId = useSettingsStore.getState().lastActiveProjectId;
    const projects = useProjectStore.getState().projects;
    if (lastId && projects.some((p) => p.id === lastId)) {
      useProjectStore.getState().setActiveProject(lastId);
    } else if (projects.length > 0) {
      useProjectStore.getState().setActiveProject(projects[0].id);
    }
    const activeId = useProjectStore.getState().activeProjectId;
    await useTodoStore.getState().loadProject(activeId);
    await useTimeViewStore.getState().load();
    setDbReady(true);
  }, []);

  useEffect(() => {
    void (async () => {
      // 仅当 v3 库为空（任何项目都不存在，含归档）且能探测到 2.x 数据时提供导入
      try {
        const existing = await repos.projects.list(true);
        const detected = existing.length === 0 ? await legacy.detectSource() : null;
        if (detected) {
          const report = await legacy.inspect(null);
          setOffer({ status: 'offer', report });
          return; // 保持 dbReady=false，等用户决定
        }
      } catch {
        /* 探测失败不阻断启动 */
      }
      setOffer({ status: 'none' });
      await finishBoot();
    })();
  }, [finishBoot]);

  const runImport = useCallback(async () => {
    if (offer.status !== 'offer') return;
    setImporting(true);
    setOfferError(null);
    try {
      await legacy.importFrom(offer.report.path);
      setOffer({ status: 'none' });
      await finishBoot();
    } catch (e) {
      setOfferError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }, [finishBoot, offer]);

  const skipImport = useCallback(async () => {
    setOffer({ status: 'none' });
    await finishBoot();
  }, [finishBoot]);

  return { dbReady, offer, importing, offerError, runImport, skipImport };
}
