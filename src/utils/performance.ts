/**
 * @file 开发环境性能标记
 * @description 仅在 Vite 开发模式写入 Performance Timeline，并输出便于筛选的调试日志。
 */

let sequence = 0;

function enabled(): boolean {
  return import.meta.env.DEV && typeof performance !== 'undefined';
}

/** 为同步工作记录耗时；名称会出现在 DevTools 的 Performance Timeline 中。 */
export function measureSync<T>(name: string, work: () => T): T {
  if (!enabled()) return work();

  const id = sequence++;
  const measureName = `celery:${name}`;
  const startMark = `${measureName}:start:${id}`;
  performance.mark(startMark);
  try {
    return work();
  } finally {
    performance.measure(measureName, startMark);
    performance.clearMarks(startMark);
    const duration = performance.getEntriesByName(measureName).at(-1)?.duration;
    console.debug(`[perf] ${name}`, { durationMs: duration?.toFixed(1) });
  }
}

/** 为异步工作记录耗时；生产构建中退化为直接执行。 */
export async function measureAsync<T>(name: string, work: () => Promise<T>): Promise<T> {
  if (!enabled()) return work();

  const id = sequence++;
  const measureName = `celery:${name}`;
  const startMark = `${measureName}:start:${id}`;
  performance.mark(startMark);
  try {
    return await work();
  } finally {
    performance.measure(measureName, startMark);
    performance.clearMarks(startMark);
    const duration = performance.getEntriesByName(measureName).at(-1)?.duration;
    console.debug(`[perf] ${name}`, { durationMs: duration?.toFixed(1) });
  }
}

/** 记录离散事件（例如虚拟列表实际挂载的 DOM 行数）。 */
export function markPerformance(name: string, detail: Record<string, number>): void {
  if (!enabled()) return;
  // 虚拟列表在滚动时会频繁改变可见区。把每次范围变化都输出到控制台，会让
  // DevTools 的日志序列化和渲染反过来占满滚动帧；保留 Timeline 标记即可。
  performance.mark(`celery:${name}`, { detail });
}
