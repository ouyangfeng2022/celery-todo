#!/usr/bin/env node
// scripts/check-repo-health.mjs
//
// 一键检查仓库健康度。检查项：
//   1. 本地非 main 分支：已合并未清除 → WARN；未合并 → ERROR
//   2. 本地 worktree（非主）：分支已合并未清除 → WARN；未合并 → ERROR
//   3. 远程开放 PR：每个 → ERROR
//   4. 远程非 main 分支：已合并未清除 → WARN；未合并 → ERROR
//
// 用法：
//   node scripts/check-repo-health.mjs             # 默认先 git fetch --prune
//   node scripts/check-repo-health.mjs --no-fetch  # 跳过 fetch，用本地缓存
//
// 退出码：0 = 干净或仅 WARN；1 = 有 ERROR；2 = 脚本环境异常

import { spawnSync } from 'node:child_process';

const MAIN_BRANCH = 'main';
const REMOTE = 'origin';
const NO_FETCH = process.argv.slice(2).includes('--no-fetch');

// ---- 命令包装：直接 spawn，避免 shell 引号 / 跨平台问题 ----
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
  return { ok: r.status === 0, stdout: (r.stdout || '').trim() };
}

function git(args, opts) {
  return run('git', args, opts);
}
function gitText(args) {
  return git(args).stdout;
}
function gitLines(args) {
  const out = gitText(args);
  return out ? out.split('\n').filter(Boolean) : [];
}

// ref 是否已合入 main：是祖先 → git 返回 status=0
function isMerged(ref) {
  return git(['merge-base', '--is-ancestor', ref, MAIN_BRANCH]).ok;
}

// ---- 收集 findings ----
const findings = [];
const push = (level, group, msg) => findings.push({ level, group, msg });

// ---- 前置：必须是 git 工作树、且本地存在 main 分支 ----
if (!git(['rev-parse', '--is-inside-work-tree']).ok) {
  console.error('❌ 当前目录不是 git 工作树');
  process.exit(2);
}
if (!git(['rev-parse', '--verify', `refs/heads/${MAIN_BRANCH}`]).ok) {
  console.error(`❌ 找不到本地主分支 ${MAIN_BRANCH}`);
  process.exit(2);
}

console.log(`🔍 仓库健康检查（主分支：${MAIN_BRANCH}）\n`);

// ---- 0. 可选 fetch（带 30s 超时，避免离线时阻塞）----
if (NO_FETCH) {
  console.log('⏭  --no-fetch 已指定，跳过远程同步\n');
} else {
  process.stdout.write('⏳ git fetch --prune ... ');
  const r = git(['fetch', REMOTE, '--prune'], { timeout: 30000 });
  console.log(r.ok ? '完成' : '失败');
  if (!r.ok) {
    push('INFO', '远程分支', 'fetch 失败，下面远程分支检查可能基于过期数据');
  }
}

// ---- 1. 本地非 main 分支 ----
const localBranches = gitLines(['branch', '--format=%(refname:short)']).filter(
  (b) => b !== MAIN_BRANCH,
);
for (const b of localBranches) {
  const date = gitText(['log', '-1', '--format=%cs', b]) || '?';
  if (isMerged(b)) {
    push('WARN', '本地分支', `\`${b}\` 已合并到 ${MAIN_BRANCH}，但未删除 (最后提交 ${date})`);
  } else {
    push('ERROR', '本地分支', `\`${b}\` 未合并到 ${MAIN_BRANCH} (最后提交 ${date})`);
  }
}

// ---- 2. worktree（非主）----
// git worktree list --porcelain 输出形如：
//   worktree <path>
//   HEAD <sha>
//   branch refs/heads/<name>   # 有分支时
//   detached                   # detached HEAD 时
const repoRoot = gitText(['rev-parse', '--show-toplevel']);
const wtLines = gitLines(['worktree', 'list', '--porcelain']);
const worktrees = [];
let cur = null;
for (const line of wtLines) {
  const sp = line.indexOf(' ');
  const key = sp === -1 ? line : line.slice(0, sp);
  const val = sp === -1 ? '' : line.slice(sp + 1);
  if (key === 'worktree') {
    cur = { path: val };
    worktrees.push(cur);
  } else if (cur && key === 'branch') {
    cur.branch = val.replace('refs/heads/', '');
  } else if (cur && key === 'detached') {
    cur.detached = true;
  }
}
for (const wt of worktrees) {
  if (wt.path === repoRoot) continue; // 跳过主 worktree
  if (wt.detached) {
    push(
      'WARN',
      'worktree',
      `${wt.path}  [detached HEAD]  建议人工确认其内容已并入 ${MAIN_BRANCH}`,
    );
    continue;
  }
  const label = `\`${wt.branch || '?'}\``;
  if (isMerged(wt.branch)) {
    push('WARN', 'worktree', `${wt.path}  分支 ${label} 已合并，但 worktree 未清除`);
  } else {
    push('ERROR', 'worktree', `${wt.path}  分支 ${label} 未合并到 ${MAIN_BRANCH}`);
  }
}

// ---- 3. 开放 PR（依赖 gh CLI）----
const ghProbe = spawnSync('gh', ['--version'], { stdio: 'ignore' });
if (ghProbe.error || ghProbe.status !== 0) {
  push('INFO', 'PR', 'gh CLI 不可用，跳过 PR 检查');
} else {
  const r = run('gh', [
    'pr',
    'list',
    '--state',
    'open',
    '--json',
    'number,title,headRefName,url',
  ]);
  if (!r.ok) {
    push('INFO', 'PR', 'gh pr list 调用失败，跳过 PR 检查');
  } else {
    let prs = [];
    if (r.stdout) {
      try {
        prs = JSON.parse(r.stdout);
      } catch {
        prs = [];
      }
    }
    for (const pr of prs) {
      push('ERROR', 'PR', `#${pr.number}  \`${pr.headRefName}\`  ${pr.title}`);
    }
  }
}

// ---- 4. 远程非 main 分支 ----
// 用 %(refname) 完整路径再自己切前缀，避免 %(refname:short) 对 HEAD 等
// 特殊后缀做意外缩短（在本仓会把 origin/HEAD 显示成裸 "origin"）
const remotePrefix = `refs/remotes/${REMOTE}/`;
const remoteBranches = gitLines(['for-each-ref', '--format=%(refname)', remotePrefix])
  .map((ref) => ref.slice(remotePrefix.length))
  .filter((b) => b !== MAIN_BRANCH && b !== 'HEAD');
for (const b of remoteBranches) {
  const ref = `${REMOTE}/${b}`;
  const date = gitText(['log', '-1', '--format=%cs', ref]) || '?';
  if (isMerged(ref)) {
    push('WARN', '远程分支', `\`${ref}\` 已合并到 ${MAIN_BRANCH}，但未删除 (最后提交 ${date})`);
  } else {
    push('ERROR', '远程分支', `\`${ref}\` 未合并到 ${MAIN_BRANCH} (最后提交 ${date})`);
  }
}

// ---- 报告输出 ----
const META = {
  ERROR: { icon: '✗', color: '\x1b[31m', label: 'ERROR' },
  WARN: { icon: '⚠', color: '\x1b[33m', label: 'WARN ' },
  INFO: { icon: 'ℹ', color: '\x1b[36m', label: 'INFO ' },
};
const RESET = '\x1b[0m';
const TTY = process.stdout.isTTY;
const paint = (m, t) => (TTY ? `${m.color}${t}${RESET}` : t);

const groups = ['本地分支', 'worktree', 'PR', '远程分支'];
console.log('');
for (const g of groups) {
  const items = findings.filter((f) => f.group === g);
  console.log(`【${g}】`);
  if (items.length === 0) {
    console.log('  ✓ 无异常');
  } else {
    for (const f of items) {
      const m = META[f.level];
      console.log(`  ${paint(m, `${m.icon} ${m.label}`)}  ${f.msg}`);
    }
  }
  console.log('');
}

const errors = findings.filter((f) => f.level === 'ERROR').length;
const warns = findings.filter((f) => f.level === 'WARN').length;

console.log('────────────────────────────────────');
if (errors > 0) {
  console.log(paint(META.ERROR, `❌ 发现 ${errors} 个 error、${warns} 个 warning`));
  process.exit(1);
}
if (warns > 0) {
  console.log(paint(META.WARN, `⚠  无 error，但有 ${warns} 个待清理项`));
  process.exit(0);
}
console.log('✅ 仓库干净');
process.exit(0);
