/**
 * @file bump-version.mjs
 * @description 发版脚本：按 SemVer 递增 package.json 版本号，同步更新 CHANGELOG.md，
 *              提交 release commit 并打 annotated tag（vX.Y.Z）。
 *
 * 用法：
 *   node scripts/bump-version.mjs <patch|minor|major> [--force] [--dry-run] [--push]
 *
 * 行为：
 *   1. 解析 <patch|minor|major>，按 SemVer 规则递增 package.json:version。
 *   2. 校验工作区干净（除非 --force），避免在脏树上打 tag。
 *   3. 把 CHANGELOG.md 顶部的 ## [Unreleased] 段落收敛为
 *      ## [vX.Y.Z] - YYYY-MM-DD，并补一个空的 ## [Unreleased] 占位段。
 *      CHANGELOG 的条目内容从 git log（按 Conventional Commits 前缀）自动归类。
 *   4. git add + commit + tag -a。任意 git 步骤失败不会自动回滚，仅打印恢复指引。
 *   5. 若指定 --push，则同时推送 commit 与 tag 到 origin。tag 推送后会触发
 *      .github/workflows/release.yml 自动构建并创建 GitHub Release。
 *      --dry-run 与 --push 互斥（dry-run 永远不写盘、不推送）。
 *
 * 退出码：0 成功；1 参数错误或前置校验失败；2 git/IO 执行失败。
 *
 * 详见仓库根目录 VERSIONING.md。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const pkgPath = resolve(root, 'package.json');
const changelogPath = resolve(root, 'CHANGELOG.md');

// ============================================
// 1. 解析 CLI 参数
// ============================================
const args = process.argv.slice(2);
const bumpKind = args.find((a) => !a.startsWith('--'));
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const push = args.includes('--push');

if (!['patch', 'minor', 'major'].includes(bumpKind ?? '')) {
  console.error(
    `[bump] 用法: node scripts/bump-version.mjs <patch|minor|major> [--force] [--dry-run] [--push]`,
  );
  process.exit(1);
}

const log = (msg) => console.log(dryRun ? `[dry-run] ${msg}` : msg);
const fail = (msg, code = 1) => {
  console.error(`[bump] ${msg}`);
  process.exit(code);
};

// ============================================
// 2. 读取并计算新版本号
// ============================================
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const current = pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(current)) {
  fail(`package.json:version 当前为 "${current}"，不符合 x.y.z 格式，请人工修复。`);
}

const [ma, mi, pa] = current.split('.').map(Number);
let next;
if (bumpKind === 'major') next = `${ma + 1}.0.0`;
else if (bumpKind === 'minor') next = `${ma}.${mi + 1}.0`;
else next = `${ma}.${mi}.${pa + 1}`;

log(`版本号: ${current} → ${next}（${bumpKind}）`);

// ============================================
// 3. 工作区干净校验
// ============================================
const gitStatus = execSync('git status --porcelain', { cwd: root, encoding: 'utf-8' }).trim();
if (gitStatus && !force && !dryRun) {
  fail(
    `工作区不干净，请先提交或 stash：\n${gitStatus}\n（或使用 --force 强制覆盖，风险自负）`,
  );
}

// ============================================
// 4. 收集 Conventional Commits 并归类
// ============================================
// 找上一个版本 tag：优先精确匹配 v<current>，否则取最近一个 v* tag。
let prevTag = `v${current}`;
try {
  execSync(`git rev-parse --verify refs/tags/${prevTag}`, { cwd: root, stdio: 'ignore' });
} catch {
  try {
    prevTag = execSync('git describe --tags --abbrev=0 --match "v*"', {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    prevTag = '';
  }
}

const logRange = prevTag ? `${prevTag}..HEAD` : 'HEAD';
const commits = execSync(`git log ${logRange} --pretty=format:"%s"`, {
  cwd: root,
  encoding: 'utf-8',
})
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);

/** @type {Record<string, string[]>} */
const buckets = { breaking: [], added: [], fixed: [], internal: [] };
for (const msg of commits) {
  // 支持 break:/feat:/fix:/perf:/refactor:/chore:/docs:/style:/test:/build:/ci
  if (/^(break|breaking|feat|fix|perf|refactor|chore|docs|style|test|build|ci)(\(.+\))?!?:/.test(msg)) {
    const isBreaking = /^(break|breaking)/.test(msg) || msg.includes('!');
    const subject = msg.replace(/^[^:]+!?:\s*/, '');
    if (isBreaking) buckets.breaking.push(subject);
    else if (/^(feat|perf)/.test(msg)) buckets.added.push(subject);
    else if (/^fix/.test(msg)) buckets.fixed.push(subject);
    else buckets.internal.push(subject);
  } else {
    // 无前缀的提交暂归入 internal（默认省略，可用 --verbose 显示）
    buckets.internal.push(msg);
  }
}

/**
 * 渲染一个 CHANGELOG 版本块（不含 ## 标题）。
 * @param {string} versionLabel 顶部标题中的版本标签（如 "Unreleased" 或 "v1.2.3"）
 * @param {string} dateLabel    顶部标题中的日期（如 "2026-07-06"），可空
 */
function renderBlock(versionLabel, dateLabel) {
  const header = dateLabel
    ? `## [${versionLabel}] - ${dateLabel}`
    : `## [${versionLabel}]`;
  if (versionLabel === 'Unreleased') {
    return `${header}\n`;
  }
  const lines = [header];
  const push = (title, items) => {
    if (!items.length) return;
    lines.push(`### ${title}`);
    for (const it of items) lines.push(`- ${it}`);
    lines.push('');
  };
  push('⚠️ Breaking', buckets.breaking);
  push('Added', buckets.added);
  push('Fixed', buckets.fixed);
  if (args.includes('--verbose')) push('Internal', buckets.internal);
  return lines.join('\n').replace(/\n+$/, '\n');
}

// ============================================
// 5. 计算新文件内容
// ============================================
const today = new Date().toISOString().slice(0, 10);

// package.json：保持 2 空格缩进 + 末尾换行（与 prettier 一致）。
const nextPkgText = `${JSON.stringify({ ...pkg, version: next }, null, 2)}\n`;

// CHANGELOG.md：替换 ## [Unreleased] 段为正式版本块，并在顶部追加新的 Unreleased 占位。
const originalChangelog = readFileSync(changelogPath, 'utf-8');
const unreleasedHeaderRe = /^## \[Unreleased\][^\n]*$/m;
if (!unreleasedHeaderRe.test(originalChangelog)) {
  fail('CHANGELOG.md 顶部未找到 "## [Unreleased]" 段，请人工补齐后再发版。');
}

const newBlockForRelease = renderBlock(`v${next}`, today);
const newEmptyUnreleased = renderBlock('Unreleased', '');

// 把"原 Unreleased 段"整体替换为"新版本块 + 空的 Unreleased 占位"。
// 原 Unreleased 段范围：从 ## [Unreleased] 行起到下一个 ## 行前。
const updatedChangelog = originalChangelog.replace(
  /(^## \[Unreleased\][^\n]*$)([\s\S]*?)(?=^## |\n\[)/m,
  `${newEmptyUnreleased}\n${newBlockForRelease}\n`,
);

// 维护底部链接定义：把 [Unreleased] 指向新版本的 compare URL。
// 优先取 package.json:repository.url（已规整为 HTTPS），回退到 git remote。
// 把 git@github.com:owner/repo.git 与 git+ssh://... 形态都规整为
// https://github.com/owner/repo —— 只有这种形态能拼出可访问的 compare/releases URL。
const repoHttps = (() => {
  const candidates = [];
  if (typeof pkg.repository === 'object' && typeof pkg.repository?.url === 'string') {
    candidates.push(pkg.repository.url);
  }
  try {
    candidates.push(
      execSync('git remote get-url origin', {
        cwd: root,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim(),
    );
  } catch {
    /* ignore */
  }
  for (const raw of candidates) {
    // SSH 形态：git@github.com:owner/repo[.git]
    const ssh = raw.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
    if (ssh) return `https://${ssh[1]}/${ssh[2]}/${ssh[3]}`;
    // git+ssh:// 或 git+https:// 形态：去掉协议前缀
    const proto = raw.match(/^git\+(ssh|https):\/\/(.+?)(?:\.git)?$/);
    if (proto) {
      if (proto[1] === 'https') return `https://${proto[2]}`;
      // ssh://git@github.com/owner/repo
      const m = proto[2].match(/^git@([^/]+)\/(.+)$/);
      if (m) return `https://${m[1]}/${m[2]}`;
    }
    // 已经是 https
    if (/^https:\/\//.test(raw)) return raw.replace(/\.git$/, '');
  }
  return null;
})();
let nextChangelog = updatedChangelog;
if (repoHttps) {
  const compare = (from, to) =>
    to === 'HEAD'
      ? `${repoHttps}/compare/${from}...HEAD`
      : `${repoHttps}/compare/${from}...${to}`;
  // 顶部 Unreleased 链接：v<next>...HEAD
  nextChangelog = nextChangelog.replace(
    new RegExp(`^\\[Unreleased\\]: .*$`, 'm'),
    `[Unreleased]: ${compare(`v${next}`, 'HEAD')}`,
  );
  // 若缺少 [v<next>] 链接则补一条指向 tag 页。
  if (!new RegExp(`^\\[v${next}\\]:`, 'm').test(nextChangelog)) {
    nextChangelog = `${nextChangelog.replace(/\n+$/, '\n')}\n[v${next}]: ${repoHttps}/releases/tag/v${next}\n`;
  }
}

// ============================================
// 6. dry-run 在此打住
// ============================================
if (dryRun) {
  console.log('--- CHANGELOG 预览（首段）---');
  console.log(nextChangelog.split('\n\n\n')[0]);
  console.log('--- 待执行 git 命令 ---');
  console.log(`git add package.json CHANGELOG.md`);
  console.log(`git commit -m "chore(release): v${next}"`);
  console.log(`git tag -a v${next} -m "Release v${next}"`);
  process.exit(0);
}

// ============================================
// 7. 落盘 + git 操作
// ============================================
try {
  writeFileSync(pkgPath, nextPkgText, 'utf-8');
  writeFileSync(changelogPath, nextChangelog, 'utf-8');
  log(`✓ 已写入 package.json (${next})`);
  log(`✓ 已更新 CHANGELOG.md`);

  execSync('git add package.json CHANGELOG.md', { cwd: root, stdio: 'inherit' });
  execSync(`git commit -m "chore(release): v${next}"`, { cwd: root, stdio: 'inherit' });
  execSync(`git tag -a v${next} -m "Release v${next}"`, { cwd: root, stdio: 'inherit' });
  log(`✓ 已提交并打 tag v${next}`);

  if (push) {
    // 仅推送当前分支与 tag。tag 推送后会触发 .github/workflows/release.yml。
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: root,
      encoding: 'utf-8',
    }).trim();
    if (currentBranch === 'HEAD') {
      fail('当前处于 detached HEAD 状态，无法 push 分支；请手动 `git push origin <branch>` 与 `git push origin v' + next + '`。', 2);
    }
    execSync(`git push origin ${currentBranch}`, { cwd: root, stdio: 'inherit' });
    execSync(`git push origin v${next}`, { cwd: root, stdio: 'inherit' });
    log(`✓ 已推送 ${currentBranch} 与 tag v${next} 到 origin`);
    log(`  GitHub Actions release.yml 将自动构建并创建 Release。`);
  } else {
    log(`下一步：git push origin <branch> && git push origin v${next}`);
    log(`  （或下次直接用 --push 一并完成。）`);
  }
} catch (err) {
  console.error(`[bump] git/IO 执行失败，未自动回滚。`);
  console.error(
    `手动恢复：\n  git reset --hard HEAD~1\n  git tag -d v${next}\n  git checkout -- package.json CHANGELOG.md`,
  );
  fail(err instanceof Error ? err.message : String(err), 2);
}
