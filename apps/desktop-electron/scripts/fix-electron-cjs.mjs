import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '../dist-electron');

mkdirSync(distDir, { recursive: true });
writeFileSync(
  resolve(distDir, 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n'
);
console.log('Created dist-electron/package.json with type: commonjs');
