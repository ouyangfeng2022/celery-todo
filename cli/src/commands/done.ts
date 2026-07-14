/**
 * @file celery done / undone —— 批量完成/取消完成
 */

import { Command } from 'commander';
import { resolveTodo, updateTodo } from '../db';
import { getRuntime, withRuntime } from '../context';
import { color, println } from '../render';

function apply(completed: boolean) {
  return withRuntime((ids: string[]) => {
    const rt = getRuntime();
    rt.guardWrite();
    rt.openReadWrite();
    const now = new Date().toISOString();
    let changed = 0;
    let skipped = 0;
    for (const input of ids) {
      const todo = resolveTodo(input);
      // 幂等：状态已符合时跳过
      if (todo.completed === completed) {
        skipped++;
        continue;
      }
      updateTodo({
        ...todo,
        completed,
        completedAt: completed ? now : undefined,
        updatedAt: now,
      });
      changed++;
    }
    const verb = completed ? '完成' : '取消完成';
    println(color.green(`${verb} ${changed} 项`));
    if (skipped > 0) println(color.gray(`（${skipped} 项已是目标状态，已跳过）`));
  });
}

export function makeDoneCommand(): Command {
  return new Command('done')
    .description('标记待办为已完成')
    .argument('<id...>', '待办 ID（支持前缀，可多个）')
    .action(apply(true));
}

export function makeUndoneCommand(): Command {
  return new Command('undone')
    .description('取消完成状态')
    .argument('<id...>', '待办 ID（支持前缀，可多个）')
    .action(apply(false));
}
