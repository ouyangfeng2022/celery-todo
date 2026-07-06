/**
 * @file extract-changelog.mjs
 * @description 从 CHANGELOG.md 中抽取指定版本段（## [vX.Y.Z] - YYYY-MM-DD 起、
 *              到下一个 ## 之前结束）的正文，供 GitHub Release 作为 release notes。
 *
 * 用法：
 *   node scripts/extract-changelog.mjs <version>      # 例：v1.2.3 或 1.2.3
 *   node scripts/extract-changelog.mjs unreleased     # 抽取 ## [Unreleased] 段
 *
 * 输出：抽取到的正文（不含 "## [...]" 标题行）写入 stdout。找不到则退出码 1。
 *
 * 详见仓库根目录 VERSIONING.md。
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const changelogPath = resolve(__dirname, '..', 'CHANGELOG.md');

const arg = process.argv[2];
if (!arg) {
  console.error('[extract-changelog] 用法: node scripts/extract-changelog.mjs <version|unreleased>');
  process.exit(1);
}

const normalize = (s) => (s === 'unreleased' ? 'Unreleased' : s.startsWith('v') ? s : `v${s}`);
const target = normalize(arg);

const text = readFileSync(changelogPath, 'utf-8');
// 匹配形如 "## [v1.2.3] - 2026-07-06" 或 "## [Unreleased]"，捕获版本标签。
const headerRe = /^## \[([^\]]+)\][^\n]*$/gm;
/** @type {{ label: string, start: number }[]} */
const sections = [];
let m;
while ((m = headerRe.exec(text)) !== null) {
  sections.push({ label: m[1], start: m.index });
}
if (!sections.length) {
  console.error('[extract-changelog] CHANGELOG.md 中未找到任何 "## [...]" 段。');
  process.exit(1);
}

const idx = sections.findIndex((s) => s.label === target);
if (idx === -1) {
  console.error(`[extract-changelog] CHANGELOG.md 中未找到版本 "${target}"。`);
  console.error('  可用版本: ' + sections.map((s) => s.label).join(', '));
  process.exit(1);
}

const start = sections[idx].start;
const headerEnd = text.indexOf('\n', start) + 1; // 跳过标题行
const end = idx + 1 < sections.length ? sections[idx + 1].start : text.length;
let body = text.slice(headerEnd, end);
// 剥离底部「链接引用定义」区（形如 [v1.0.0]: https://...）。
// Keep a Changelog 格式中这些定义紧跟在最后一段后面，不属于 release notes。
const linkDefRe = /\n*\[[^\]]+\]:\s*[^\n]+/g;
body = body.replace(linkDefRe, '').trim();

if (!body) {
  console.error(`[extract-changelog] 版本 "${target}" 段为空。`);
  process.exit(1);
}

process.stdout.write(body + '\n');
