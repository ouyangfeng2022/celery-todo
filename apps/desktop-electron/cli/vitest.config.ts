import { defineConfig } from 'vitest/config';

// CLI 独立 vitest 配置：node 环境，scope 限定在 cli/test，避免与主 vitest（src/、jsdom）冲突。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['cli/test/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'dist-cli', 'dist-electron', 'e2e', 'src'],
  },
});
