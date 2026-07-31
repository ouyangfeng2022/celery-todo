/**
 * Playwright 配置：驱动真实 Electron 应用做 E2E 测试。
 *
 * 关键点：
 * - workers=1 + fullyParallel=false：Electron 单实例锁（main.ts requestSingleInstanceLock）
 *   会阻止同 userData 下并发启动，必须串行。
 * - globalSetup: build:electron 在首个 Electron 实例启动前完成 renderer(dist/)
 *   与主进程(dist-electron/)编译，避免测试读取构建中的产物。
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Electron E2E 直接从 dist/ 与 dist-electron/ 启动。构建命令是一次性任务，
  // 不能放在 webServer：Playwright 会把它当成长驻服务，在构建仍在重写产物时
  // 就启动测试，冷启动中的 renderer 可能读到不完整的文件并崩溃。
  globalSetup: './e2e/global-setup.ts',
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
  projects: [
    {
      name: 'electron',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
