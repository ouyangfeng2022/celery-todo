/**
 * @file WebdriverIO + tauri-driver 配置（Tauri 官方 E2E 方案）
 * @description tauri-driver 是 Tauri 的 WebDriver 实现（W3C 协议），
 *              wdio 经 localhost:4444 驱动真实应用二进制 —— 测的是打包后的
 *              完整链路（WebView UI + Rust 命令 + SQLite）。
 *
 *              隔离：CELERY_DB_PATH 指向临时目录，绝不触碰真实 appData。
 *              本地运行会弹出真实窗口（CI 的 windows runner 有桌面会话）。
 */

import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const confDir = dirname(fileURLToPath(import.meta.url));
export const E2E_DB_DIR = join(tmpdir(), 'celery-todo-e2e');
export const E2E_DB_PATH = join(E2E_DB_DIR, 'e2e.db');

export const config = {
  runner: 'local',
  // tauri-driver 监听在本机 4444（wdio 连接而非自启浏览器驱动）
  hostname: '127.0.0.1',
  port: 4444,
  // wdio 默认 rootDir = 配置文件所在目录（e2e/），pattern 相对该目录
  specs: ['**/*.spec.ts'],
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      'wdio:tauriOptions': {
        // tauri build --debug --no-bundle 产物（资产经 CLI 嵌入；workspace 根 target/）。
        // 用绝对路径 —— tauri-driver 按自身 cwd 解析相对路径。
        application: resolve(
          confDir,
          '..',
          '..',
          '..',
          'target',
          'debug',
          process.platform === 'win32' ? 'celery-desktop.exe' : 'celery-desktop',
        ),
        env: {
          CELERY_DB_PATH: E2E_DB_PATH,
        },
      },
      'ms:webdriverOptions': {},
    },
  ],
  logLevel: 'error',
  bail: 0,
  baseUrl: 'http://localhost',
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 2,
  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },
  reporters: ['spec'],
  before: () => {
    // 每轮全新数据库
    rmSync(E2E_DB_DIR, { recursive: true, force: true });
    mkdirSync(E2E_DB_DIR, { recursive: true });
  },
};
