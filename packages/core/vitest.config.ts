import { defineConfig } from 'vitest/config';

// 共享内核是纯 TypeScript，测试跑在 node 环境即可（无 DOM 依赖）。
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
} as any);
