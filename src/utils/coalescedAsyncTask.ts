/**
 * 将高成本异步任务合并为串行执行：运行期间的新请求只保留一轮后续执行。
 *
 * 适合数据库重载、索引重建这类必须看到最后一次变更、但不必逐条处理每个
 * 通知的任务。dispose 后不会再启动下一轮，避免组件卸载后继续无意义地刷新。
 */
export interface CoalescedAsyncTask {
  schedule: () => void;
  dispose: () => void;
}

export function createCoalescedAsyncTask(task: () => Promise<void>): CoalescedAsyncTask {
  let running = false;
  let pending = false;
  let disposed = false;

  const run = async (): Promise<void> => {
    try {
      while (pending && !disposed) {
        pending = false;
        await task();
      }
    } finally {
      running = false;
    }
  };

  return {
    schedule: () => {
      if (disposed) return;
      pending = true;
      if (running) return;
      running = true;
      // IPC 事件没有可等待的调用方；避免一次重载失败形成未处理 Promise，
      // 下一个 data:changed 事件仍可正常触发重试。
      void run().catch(() => {});
    },
    dispose: () => {
      disposed = true;
      pending = false;
    },
  };
}
