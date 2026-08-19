/**
 * @file generate-mobile-icons.mjs
 * @description 一次性脚本：把品牌 Logo（橙色无文字版，与桌面端图标同源）
 * 光栅化为 Expo 移动端所需的图标资产。
 *
 * 源：apps/desktop-electron/assets/celery-todo-no-text-light.svg
 * （主配色 = 橙色版，见 scripts/generate-icons.mjs 的说明）
 *
 * 产物（apps/mobile/assets/）：
 *   - icon.png            1024×1024  Expo icon（iOS 不允许透明，纸白底）
 *   - adaptive-icon.png   1024×1024  Android 自适应图标前景（内容收进 60% 安全区）
 *   - splash-icon.png     1024×1024  启动页 Logo（透明底，contain 显示）
 *
 * 背景 #f9f9f7 与 apps/mobile/app.json 的 backgroundColor 一致。
 * app.json 只引用产物路径；改动 SVG 源后重跑本脚本即可。
 *
 * 用法： node scripts/generate-mobile-icons.mjs（仓库根执行）
 * 依赖： sharp（根 devDependencies）
 */

import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const svgPath = resolve(root, 'apps/desktop-electron/assets/celery-todo-no-text-light.svg');
const outDir = resolve(root, 'apps/mobile/assets');

if (!existsSync(svgPath)) {
  console.error(`[generate-mobile-icons] 找不到 SVG 源文件: ${svgPath}`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const svgBuffer = readFileSync(svgPath);
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
// 纸白（与 app.json backgroundColor / ui-tokens 纸白主题同源的浅色底）
const paper = '#f9f9f7';

const sharp = (await import('sharp')).default;

/** 把 Logo 按给定边长 contain 光栅化（保持宽高比，留白透明）。 */
const glyph = (size) =>
  sharp(svgBuffer, { density: 384 })
    .resize(size, size, { fit: 'contain', background: transparent })
    .png()
    .toBuffer();

/** 居中贴到 1024×1024 画布（底色可选）。 */
const canvas = async (glyphBuf, background, out) => {
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background },
  })
    .composite([{ input: glyphBuf, gravity: 'center' }])
    .png()
    .toFile(out);
  console.log(`[generate-mobile-icons] ✓ ${out}`);
};

// 1. 通用 icon：纸白底 + 80% Logo（iOS 禁止透明通道）
await canvas(await glyph(820), paper, resolve(outDir, 'icon.png'));

// 2. Android 自适应图标前景：透明底，Logo 收进中心 60%（66/108 安全区之内）
await canvas(await glyph(614), transparent, resolve(outDir, 'adaptive-icon.png'));

// 3. 启动页 Logo：透明底，46% 留足呼吸感
await canvas(await glyph(470), transparent, resolve(outDir, 'splash-icon.png'));

console.log('[generate-mobile-icons] 完成。');
