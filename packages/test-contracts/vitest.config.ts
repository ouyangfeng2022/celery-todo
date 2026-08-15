import { defineConfig } from 'vitest/config';

// 契约套件包：在此对内存适配器（以及未来的 Tauri / Expo 适配器）跑同一套 Repository 契约。
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
} as any);
