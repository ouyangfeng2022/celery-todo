/**
 * @file celery pin / unpin —— 置顶/取消置顶
 */

import { Command } from 'commander';
import { resolveTodo, updateTodoFields } from '../db';
import { getRuntime, withRuntime } from '../context';
import { color, println } from '../render';

function apply(pinned: boolean) {
  return withRuntime(async (ids: string[]) => {
    const rt = getRuntime();
    rt.guardWrite();
    await rt.openReadWrite();
    let changed = 0;
    let skipped = 0;
    for (const input of ids) {
      const todo = await resolveTodo(input);
      // 幂等：状态已符合时跳过
      if (todo.pinned === pinned) {
        skipped++;
        continue;
      }
      await updateTodoFields(todo.id, { pinned });
      changed++;
    }
    const verb = pinned ? '置顶' : '取消置顶';
    println(color.green(`${verb} ${changed} 项`));
    if (skipped > 0) println(color.gray(`（${skipped} 项已是目标状态，已跳过）`));
  });
}

export function makePinCommand(): Command {
  return new Command('pin')
    .description('置顶待办（始终显示在列表最前）')
    .argument('<id...>', '待办 ID（支持前缀，可多个）')
    .action(apply(true));
}

export function makeUnpinCommand(): Command {
  return new Command('unpin')
    .description('取消置顶')
    .argument('<id...>', '待办 ID（支持前缀，可多个）')
    .action(apply(false));
}
