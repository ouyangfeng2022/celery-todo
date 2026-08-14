import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// 读取 package.json 中的 version 字段，作为应用版本号的唯一源。
// 通过 define 在构建期把 __APP_VERSION__ 注入为字符串常量。
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
) as { version: string };

// Tauri 桌面端 renderer 的 Vite 配置。
// 端口 5174：与迁移壳（Electron，5173）区分，允许两套应用并行开发。
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  base: './',
  server: {
    port: 5174,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    outDir: 'dist',
    // Tauri 2 依赖系统 WebView：Windows 用 WebView2（Chromium），macOS 用 WKWebView。
    target: 'chrome105',
    sourcemap: false,
    rollupOptions: {
      output: {
        // 与 2.x 一致的按稳定性分层拆 chunk（去掉 sql.js —— 3.0 数据层在 Rust）。
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            // 按需功能：进入对应功能后才需要，勿并入首屏。
            if (id.includes('node_modules/xlsx')) return 'xlsx';
            if (id.includes('node_modules/html-to-image')) return 'image-export';
            if (id.includes('node_modules/react-markdown')) return 'markdown';
            if (
              id.includes('node_modules/remark-') ||
              id.includes('node_modules/rehype-') ||
              id.includes('node_modules/katex') ||
              id.includes('node_modules/unified') ||
              id.includes('node_modules/unist-')
            ) {
              return undefined;
            }
            if (id.includes('node_modules/framer-motion') || id.includes('node_modules/@dnd-kit')) {
              return 'motion-dnd';
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
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
} as any);
