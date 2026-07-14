/**
 * @file celery restore —— 从回收站恢复待办
 */

import { Command } from 'commander';
import { restoreFromArchive, resolveDeletedTodo } from '../db';
import { getRuntime, withRuntime } from '../context';
import { color, println } from '../render';

export function makeRestoreCommand(): Command {
  return new Command('restore')
    .description('从回收站恢复待办')
    .argument('<id...>', '归档项 ID（支持前缀，可多个）')
    .action(
      withRuntime((ids: string[]) => {
        const rt = getRuntime();
        rt.guardWrite();
        rt.openReadOnly();
        // 预解析，全部存在才执行
        const items = ids.map((input) => resolveDeletedTodo(input));
        rt.openReadWrite();
        const now = new Date().toISOString();
        for (const it of items) {
          restoreFromArchive(it.id, now);
        }
        println(color.green(`已恢复 ${items.length} 项`));
      }),
    );
}
