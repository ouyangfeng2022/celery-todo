/**
 * E2E 全局准备：在任何 Electron 实例启动前完成一次构建。
 *
 * 不能用 Playwright 的 webServer 执行构建；webServer 面向常驻 HTTP 服务，
 * 会与 Electron 读取 dist 形成竞态。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');

export default async function globalSetup(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('bun', ['run', 'build:electron'], {
      cwd: projectRoot,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`E2E 构建失败（code=${code ?? 'null'}, signal=${signal ?? 'none'}）`));
    });
  });
}
