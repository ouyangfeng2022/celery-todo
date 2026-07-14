/**
 * @file celery priority —— 修改优先级
 */

import { Command } from 'commander';
import { resolveTodo, updateTodoFields } from '../db';
import { getRuntime, withRuntime } from '../context';
import { color, priorityLabel, println } from '../render';
import { type Priority } from '../types';

export function makePriorityCommand(): Command {
  return new Command('priority')
    .description('修改待办优先级（high/medium/low）')
    .argument('<id>', '待办 ID（支持前缀）')
    .argument('<level>', 'high | medium | low')
    .action(
      withRuntime(async (idInput: string, level: string) => {
        const rt = getRuntime();
        if (!['high', 'medium', 'low'].includes(level)) {
          throw new Error('优先级必须是 high / medium / low');
        }
        rt.guardWrite();
        await rt.openReadWrite();
        const todo = await resolveTodo(idInput);
        const newPriority = level as Priority;
        await updateTodoFields(todo.id, { priority: newPriority });
        println(
          color.green('已更新优先级 ✓ ') +
            color.gray(`${todo.title} → ${priorityLabel(newPriority)}`),
        );
      }),
    );
}
