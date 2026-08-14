import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri 桌面端 renderer 的 Vite 配置。
// 端口 5174：与迁移壳（Electron，5173）区分，允许两套应用并行开发。
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
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
  },
});
