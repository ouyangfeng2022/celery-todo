/**
 * @file celery restore —— 从回收站恢复待办
 */

import { Command } from 'commander';
import { resolveDeletedTodo, restoreTodo } from '../db';
import { getRuntime, withRuntime } from '../context';
import { color, println } from '../render';

export function makeRestoreCommand(): Command {
  return new Command('restore')
    .description('从回收站恢复待办')
    .argument('<id...>', '归档项 ID（支持前缀，可多个）')
    .action(
      withRuntime(async (ids: string[]) => {
        const rt = getRuntime();
        rt.guardWrite();
        await rt.openReadOnly();
        // 预解析，全部存在才执行
        const items = [];
        for (const input of ids) {
          items.push(await resolveDeletedTodo(input));
        }
        await rt.openReadWrite();
        for (const it of items) {
          await restoreTodo(it.id);
        }
        println(color.green(`已恢复 ${items.length} 项`));
      }),
    );
}
