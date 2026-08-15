/**
 * @file better-sqlite3 的 Electron ABI 验证闸门
 * @description monorepo hoisted 布局下，@electron/rebuild 的模块发现以仓库根
 *              package.json 的依赖为种子，better-sqlite3 只声明在
 *              apps/desktop-electron 里时会被静默跳过（重建 0 个模块但退出码为 0），
 *              打出的安装包带着 Node/Bun ABI 的预编译产物，首个 data:query 即
 *              dlopen 失败，renderer 初始化链中断、加载页无限转圈（2.20.2 事故）。
 *              这里用 Electron 自带的 Node（ELECTRON_RUN_AS_NODE）实际加载编译
 *              产物并跑一次真实 SQL：ABI 不匹配在打包前失败，而不是装到用户
 *              机器上才暴露。由 rebuild:electron 末尾强制调用。
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// 普通 Node 进程里 require('electron') 返回的是 electron 可执行文件路径。
const electronExe = require('electron');

const probe = [
  "const Database = require('better-sqlite3');",
  "const db = new Database(':memory:');",
  "db.exec('CREATE TABLE probe(x INTEGER)');",
  "db.prepare('INSERT INTO probe VALUES (1)').run();",
  "if (db.prepare('SELECT x FROM probe').pluck().get() !== 1) process.exit(1);",
  "console.log('better-sqlite3 loaded under electron', process.versions.electron, '(node', process.versions.node + ')');",
].join(' ');

const result = spawnSync(electronExe, ['-e', probe], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  encoding: 'utf8',
});

if (result.error) {
  console.error('[verify-native-abi] 无法启动 electron 可执行文件：', result.error.message);
  process.exit(1);
}
if (result.status !== 0) {
  console.error('[verify-native-abi] better-sqlite3 无法在 Electron ABI 下加载（通常是 NODE_MODULE_VERSION 不匹配）。');
  console.error(result.stdout);
  console.error(result.stderr);
  console.error('请先执行 `bun run rebuild:electron`（根 package.json 的 devDependencies 必须声明 better-sqlite3，@electron/rebuild 才能发现它）。');
  process.exit(result.status ?? 1);
}
console.log(result.stdout.trim());
