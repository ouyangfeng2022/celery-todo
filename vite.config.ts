import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// 读取 package.json 中的 version 字段，作为应用版本号的唯一源。
// 通过 define 在构建期把 __APP_VERSION__ 注入为字符串常量；
// 运行时由 src/utils/version.ts 统一对外暴露，避免散落使用全局变量。
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
) as { version: string };

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  // 预构建 sql.js 浏览器 WASM 模块
  optimizeDeps: {
    include: ['sql.js/dist/sql-wasm-browser.js'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    // 排除 Playwright E2E 测试目录（由 playwright.config.ts 独立驱动真实 Electron，
    // 不在 jsdom 里跑）。否则 vitest 默认会扫所有 *.spec.ts 导致 e2e 误入。
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/', 'dist/', 'e2e/'],
  },
} as any);
