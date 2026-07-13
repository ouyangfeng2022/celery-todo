/**
 * electron-builder afterPack 钩子：精简 Chromium locales。
 *
 * Electron 默认打包 ~55 种语言的 .pak 文件（约 39MB），本应用仅需中文 + 英文。
 * afterPack 在 win-unpacked 生成后、打 NSIS 之前执行，删除多余 .pak 即可
 * 直接降低最终安装包体积（约 -37MB）。
 *
 * 触发条件：所有平台都会运行；非 Windows 下 locales 目录可能不存在，静默跳过。
 */

import { readdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** 需要保留的 Chromium locale（中文 + 英文，覆盖 zh-CN / zh-TW / en-US / en-GB） */
const KEEP = new Set(['zh-CN.pak', 'zh-TW.pak', 'en-US.pak', 'en-GB.pak']);

/**
 * @param {{ appOutDir: string, electronPlatformName: string, outDir: string }} context
 */
export default async function (context) {
  const localesDir = join(context.appOutDir, 'locales');

  // 目录不存在时静默跳过（理论上不会发生，但避免抛错中断打包）
  try {
    await stat(localesDir);
  } catch {
    console.log(`[trim-locales] 跳过：${localesDir} 不存在`);
    return;
  }

  const files = await readdir(localesDir);
  const toRemove = files.filter((f) => f.endsWith('.pak') && !KEEP.has(f));

  let removed = 0;
  for (const f of toRemove) {
    await unlink(join(localesDir, f));
    removed++;
  }

  console.log(
    `[trim-locales] 保留 ${files.length - removed} 个 locale，删除 ${removed} 个（${context.electronPlatformName}）`,
  );
}
