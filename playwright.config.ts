/**
 * Playwright 配置：驱动真实 Electron 应用做 E2E 测试。
 *
 * 关键点：
 * - workers=1 + fullyParallel=false：Electron 单实例锁（main.ts requestSingleInstanceLock）
 *   会阻止同 userData 下并发启动，必须串行。
 * - webServer: build:electron 提前把 renderer(dist/) 和主进程(dist-electron/) 编译好，
 *   reuseExistingServer 让开发时手动构建一次即可，不必每次重跑。
 * - 测试自身不依赖 webServer 进程的 URL（用 _electron.launch 启动 app），
 *   webServer 仅作为「确保产物已构建」的触发器。
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000, // 单实例串行 + 冷启动加载 sql-wasm 较慢，留足余量
  expect: { timeout: 10_000 },
  // 启动 / 冷启动偶发 flaky（Windows 多进程串行 + 系统残留进程导致资源紧张），
  // 允许重试兜底。CI 给 2 次更稳；本地 1 次即可。
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // 仅作为构建触发器；测试本身不请求其 URL。
  webServer: {
    command: 'bun run build:electron',
    cwd: '.',
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'electron',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
