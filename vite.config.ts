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
    // 生产构建关闭 sourcemap：体积省 ~2.4MB，避免业务代码暴露。
    // 需要调试时用 dev server 或单独开启。
    sourcemap: false,
    // 第三方库拆出独立 chunk：业务代码与 vendor 分离，
    // 既能减小主 bundle 初始 parse 时间，也方便 electron-updater
    // 增量分发（业务代码 chunk 命中哈希的概率高于 vendor）。
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // node_modules 内的依赖按"稳定性分层"拆 chunk：
          // - react-vendor: react/react-dom/scheduler（最稳定，几乎永不升级）
          // - motion-dnd:   framer-motion + @dnd-kit（动画/拖拽，体积大）
          // - sqljs:        sql.js JS 胶水层（WASM 二进制是单独文件）
          // - vendor:       其余第三方（zustand/canvas-confetti/clsx/react-markdown 等）
          //
          // 注：不再单拆 markdown——react-markdown 依赖链里的部分工具函数
          // 被其他包（含 vendor 内）共享，强拆会触发 rollup 的 circular chunk 警告。
          if (id.includes('node_modules')) {
            if (id.includes('node_modules/framer-motion') || id.includes('node_modules/@dnd-kit')) {
              return 'motion-dnd';
            }
            if (id.includes('node_modules/sql.js')) {
              return 'sqljs';
            }
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/scheduler/')
            ) {
              return 'react-vendor';
            }
            return 'vendor';
          }
          return undefined;
        },
      },
    },
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
