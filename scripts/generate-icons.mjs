/**
 * @file generate-icons.mjs
 * @description 一次性脚本：把 assets/logo.svg 光栅化为 Electron 所需的图标。
 *
 * 产物：
 *   - public/icon.png      256×256  主进程窗口图标 + electron-builder 默认图标源
 *   - public/icon-16.png   16×16    Windows 托盘图标（SVG 在托盘上不可靠）
 *   - public/icon-32.png   32×32    Windows 托盘高清版
 *   - public/icon.ico      多尺寸   electron-builder win.icon（可选，比 PNG 更友好）
 *
 * 用法： node scripts/generate-icons.mjs
 * 依赖： sharp + png-to-ico（通过 npx 临时安装，不写进 package.json）
 */

import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const svgPath = resolve(root, 'assets/logo.svg');
const publicDir = resolve(root, 'public');

if (!existsSync(svgPath)) {
  console.error(`[generate-icons] 找不到 SVG 源文件: ${svgPath}`);
  process.exit(1);
}
mkdirSync(publicDir, { recursive: true });

const svgBuffer = readFileSync(svgPath);

// 动态拉取 sharp —— 不在项目依赖里
const sharp = (await import('sharp')).default;

// ============================================
// 1. PNG 产物（窗口图标 + 托盘）
// ============================================
const sizes = [16, 32, 64, 128, 256];
for (const size of sizes) {
  const out = resolve(publicDir, size === 256 ? 'icon.png' : `icon-${size}.png`);
  await sharp(svgBuffer, { density: 384 }).resize(size, size).png().toFile(out);
  console.log(`[generate-icons] ✓ ${size}x${size} → ${out}`);
}

// ============================================
// 2. Windows ICO 产物（更受 electron-builder / Explorer 喜爱）
// ============================================
try {
  const pngToIco = (await import('png-to-ico')).default;
  // ICO 内嵌多尺寸：16 / 32 / 48 / 64 / 128 / 256
  const icoPngs = await Promise.all(
    [16, 32, 48, 64, 128, 256].map((s) =>
      sharp(svgBuffer, { density: 384 }).resize(s, s).png().toBuffer(),
    ),
  );
  const icoBuf = await pngToIco(icoPngs);
  const icoPath = resolve(publicDir, 'icon.ico');
  await import('node:fs/promises').then((m) => m.writeFile(icoPath, icoBuf));
  console.log(`[generate-icons] ✓ ICO → ${icoPath}`);
} catch (err) {
  console.warn(
    `[generate-icons] ICO 生成跳过（png-to-ico 不可用）：${err instanceof Error ? err.message : err}`,
  );
}

console.log('[generate-icons] 完成。');
