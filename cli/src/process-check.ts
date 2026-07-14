/**
 * @file best-effort 检测 Celery Todo 桌面应用是否正在运行
 * @description App 把 DB 持在内存 + 500ms 防抖写回文件。若 App 运行时 CLI
 *              写入文件，App 下一次 save 会用内存副本覆盖，导致 CLI 改动丢失。
 *              此模块尽力检测进程，命中时由调用方决定是否中断（--force 可跳过）。
 *
 * 实现：跨平台调用进程列表命令并匹配可执行文件名。检测失败（命令缺失/权限）
 * 视作「未检测到」，永远不阻塞用户。
 */

import { spawnSync } from 'node:child_process';

/** App 进程名（不带扩展名）——与 electron-builder productName 一致 */
const PROCESS_NAME = 'Celery Todo';

/**
 * 返回当前是否有 Celery Todo 进程在运行。
 * - Windows: tasklist /FI 筛选可执行名
 * - macOS / Linux: pgrep -f 全命令行匹配
 * 任何子进程异常都吞掉，返回 false。
 */
export function isAppRunning(): boolean {
  try {
    if (process.platform === 'win32') {
      // tasklist 输出含表头；用 /FO CSV 简化解析。IMAGENAME 形如 "Celery Todo.exe"
      const res = spawnSync(
        'tasklist',
        ['/FI', `IMAGENAME eq ${PROCESS_NAME}.exe`, '/FO', 'CSV', '/NH'],
        {
          encoding: 'utf8',
          windowsHide: true,
        },
      );
      if (res.status !== 0 || !res.stdout) return false;
      // 命中行形如 "Celery Todo.exe","1234",...
      return res.stdout.toLowerCase().includes(`${PROCESS_NAME.toLowerCase()}.exe`);
    }
    // macOS / Linux：pgrep -f 匹配完整命令行
    const res = spawnSync('pgrep', ['-f', PROCESS_NAME], { encoding: 'utf8' });
    if (res.error) return false;
    // pgrep 命中时返回 0 且 stdout 含 pid
    return res.status === 0 && res.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * 校验是否安全执行写操作。
 * @param force 用户显式 --force 跳过检测
 * @throws 当 App 正在运行且未 --force 时
 */
export function ensureSafeToWrite(force: boolean): void {
  if (force) return;
  if (isAppRunning()) {
    throw new Error(
      '检测到 Celery Todo 桌面应用正在运行。\n' +
        '应用会把数据库缓存在内存中并在退出时写回，此时 CLI 的改动会被覆盖。\n' +
        '请先完全退出 App，或使用 --force 跳过此检查（风险自负）。',
    );
  }
}
