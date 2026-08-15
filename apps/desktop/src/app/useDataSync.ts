/**
 * @file 跨窗口数据同步
 * @description Rust 写命令成功后向所有窗口广播 data-changed（自发事件已在平台层
 *              按窗口 label 过滤）。此处按事件粒度重读受影响的 store ——
 *              贴图窗口 / CLI 写入（阶段 B/C）后主窗口即时刷新。
 */

import { useEffect } from 'react';
import * as data from '../utils/dataGateway';
import { createCoalescedAsyncTask } from '../utils/coalescedAsyncTask';
import { useProjectStore } from '../store/useProjectStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTimeViewStore } from '../store/useTimeViewStore';
import { useTodoStore } from '../store/useTodoStore';

export function useDataSync(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    // 时间视图的 load 是全量读取；把一个通知周期内的多次变更合并成一次回读。
    const timeViewReload = createCoalescedAsyncTask(async () => {
      await useTimeViewStore.getState().load();
    });
    const off = data.onDataChanged((event) => {
      const currentProjectId = useProjectStore.getState().activeProjectId;
      if (event.fullRefresh || event.projectsChanged) {
        void useProjectStore.getState().loadProjects();
      }
      if (event.fullRefresh || event.settingsChanged) {
        void useSettingsStore.getState().loadSettings();
      }
      if (
        event.fullRefresh ||
        event.todosChanged ||
        event.archiveChanged ||
        event.projectIds.includes(currentProjectId)
      ) {
        void useTodoStore.getState().loadProject(currentProjectId);
      }
      timeViewReload.schedule();
    });
    return () => {
      timeViewReload.dispose();
      off();
    };
  }, [enabled]);
}
