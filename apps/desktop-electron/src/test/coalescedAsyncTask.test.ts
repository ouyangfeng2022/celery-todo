/** @file 合并异步任务调度测试 */

import { describe, expect, it, vi } from 'vitest';
import { createCoalescedAsyncTask } from '../utils/coalescedAsyncTask';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('createCoalescedAsyncTask', () => {
  it('运行中收到多次请求时只追加一次任务', async () => {
    const first = deferred();
    const second = deferred();
    const task = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const runner = createCoalescedAsyncTask(task);

    runner.schedule();
    await Promise.resolve();
    runner.schedule();
    runner.schedule();
    expect(task).toHaveBeenCalledTimes(1);

    first.resolve();
    await Promise.resolve();
    expect(task).toHaveBeenCalledTimes(2);

    second.resolve();
    await Promise.resolve();
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('释放后不再执行排队任务或响应新请求', async () => {
    const first = deferred();
    const task = vi.fn().mockReturnValue(first.promise);
    const runner = createCoalescedAsyncTask(task);

    runner.schedule();
    await Promise.resolve();
    runner.schedule();
    runner.dispose();
    first.resolve();
    await Promise.resolve();
    runner.schedule();

    expect(task).toHaveBeenCalledTimes(1);
  });
});
