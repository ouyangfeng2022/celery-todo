#!/usr/bin/env node
/**
 * @file celery —— Celery Todo 命令行入口
 * @description 直接读写桌面应用的 SQLite 数据库文件，提供与 GUI 对齐的待办管理。
 *
 * 全局选项：
 *   --db <path>    显式指定数据库文件路径（覆盖一切自动定位）
 *   --force        写操作时跳过「App 运行中」检测（风险自负）
 *   --json         输出 JSON 而非表格（便于脚本消费）
 *
 * 空参运行等价于 `celery list`。
 */

import { Command } from 'commander';
import { APP_PRODUCT_NAME } from './storage';
import { setGlobalOptions } from './context';
import { makeAddCommand } from './commands/add';
import { makeArchiveCommand } from './commands/archive';
import { makeConfigCommand } from './commands/config';
import { makeDeleteCommand } from './commands/delete';
import { makeDoneCommand, makeUndoneCommand } from './commands/done';
import { makeDueCommand } from './commands/due';
import { makeEditCommand } from './commands/edit';
import { makeListCommand } from './commands/list';
import { makePriorityCommand } from './commands/priority';
import { makeProjectsCommand } from './commands/projects';
import { makeRestoreCommand } from './commands/restore';
import { makeShowCommand } from './commands/show';
import { makeStatsCommand } from './commands/stats';
import { color, println } from './render';

const program = new Command();

program
  .name('celery')
  .description(`${APP_PRODUCT_NAME} 命令行 —— 直接管理桌面应用的待办数据库`)
  .option('--db <path>', '显式指定数据库文件路径')
  .option('--force', '写操作时跳过「App 运行中」检测（风险自负）')
  .option('--json', '输出 JSON 而非表格');

// 在任何 action 执行前，把顶层 program 的选项注入运行时上下文。
// 这样各子命令通过 getRuntime() 即可拿到 --db/--force/--json。
program.hook('preAction', (cmd) => {
  // 沿父链向上找带这些 flag 的 program（子命令自身不重复声明）
  let node: Command | null = cmd;
  let db: string | undefined;
  let force: boolean | undefined;
  let json: boolean | undefined;
  while (node) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = (node as any).opts();
    if (db === undefined && o.db !== undefined) db = o.db;
    if (force === undefined && o.force !== undefined) force = o.force;
    if (json === undefined && o.json !== undefined) json = o.json;
    node = node.parent;
  }
  setGlobalOptions({ db, force, json });
});

// 注册所有子命令
program.addCommand(makeListCommand());
program.addCommand(makeAddCommand());
program.addCommand(makeShowCommand());
program.addCommand(makeEditCommand());
program.addCommand(makeDoneCommand());
program.addCommand(makeUndoneCommand());
program.addCommand(makeDeleteCommand());
program.addCommand(makeRestoreCommand());
program.addCommand(makePriorityCommand());
program.addCommand(makeDueCommand());
program.addCommand(makeArchiveCommand());
program.addCommand(makeProjectsCommand());
program.addCommand(makeStatsCommand());
program.addCommand(makeConfigCommand());

// 空参快捷入口：等价 `celery list`
const argv = process.argv.slice(2);
if (argv.length === 0) {
  process.argv = [process.argv[0], process.argv[1], 'list'];
}

program.parseAsync(process.argv).catch((err: unknown) => {
  println(color.red('错误: ') + (err instanceof Error ? err.message : String(err)));
  process.exitCode = 1;
});
