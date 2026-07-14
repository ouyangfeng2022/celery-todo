/**
 * @file celery edit —— 修改标题/描述
 */

import { Command } from 'commander';
import { resolveTodo, updateTodo } from '../db';
import { getRuntime, withRuntime } from '../context';
import { color, printJson, println, renderTodoDetail } from '../render';

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
      withRuntime((idInput: string, opts: EditOpts) => {
        const rt = getRuntime();
        if (!opts.title && opts.desc === undefined) {
          throw new Error('至少提供 --title 或 --desc 之一');
        }
        rt.guardWrite();
        rt.openReadWrite();
        const todo = resolveTodo(idInput);
        const updated = {
          ...todo,
          title: opts.title?.trim() || todo.title,
          description: opts.desc !== undefined ? opts.desc.trim() || undefined : todo.description,
          updatedAt: new Date().toISOString(),
        };
        updateTodo(updated);
        if (rt.json) {
          printJson(updated);
          return;
        }
        println(color.green('已更新 ✓'));
        println(renderTodoDetail(updated));
      }),
    );
}
