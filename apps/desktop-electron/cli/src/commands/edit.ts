/**
 * @file celery edit —— 修改标题/描述
 */

import { Command } from 'commander';
import { resolveTodo, updateTodoFields } from '../db';
import { getRuntime, withRuntime } from '../context';
import { color, println } from '../render';

interface EditOpts {
  title?: string;
  desc?: string;
}

export function makeEditCommand(): Command {
  return new Command('edit')
    .description('修改待办的标题或描述')
    .argument('<id>', '待办 ID（支持前缀）')
    .option('-t, --title <text>', '新标题')
    .option('-d, --desc <text>', '新描述（传空串清除）')
    .action(
      withRuntime(async (idInput: string, opts: EditOpts) => {
        const rt = getRuntime();
        if (!opts.title && opts.desc === undefined) {
          throw new Error('至少提供 --title 或 --desc 之一');
        }
        rt.guardWrite();
        await rt.openReadWrite();
        const todo = await resolveTodo(idInput);
        const updates: { title?: string; description?: string } = {};
        if (opts.title) updates.title = opts.title.trim();
        if (opts.desc !== undefined) updates.description = opts.desc.trim() || undefined;
        await updateTodoFields(todo.id, updates);
        println(color.green('已更新 ✓ ') + color.gray(todo.id.slice(0, 8)));
      }),
    );
}
