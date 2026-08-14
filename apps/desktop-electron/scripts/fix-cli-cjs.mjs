// 为 dist-cli 写入 package.json，将其强制标记为 CommonJS 模块。
// CLI 输出是 CommonJS（cli/tsconfig.json 的 module: CommonJS），而根 package.json
// 是 "type": "module"，不写入此标记会导致 Node 以 ESM 加载 .js 失败。
// 模式照搬 scripts/fix-electron-cjs.mjs。
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '../dist-cli');

mkdirSync(distDir, { recursive: true });
writeFileSync(
  resolve(distDir, 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
);
console.log('Created dist-cli/package.json with type: commonjs');
