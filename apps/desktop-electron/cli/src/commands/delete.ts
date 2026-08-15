/**
 * @file celery delete —— 归档（移入历史记录）
 */

import { Command } from 'commander';
import { deleteTodo, resolveTodo } from '../db';
import { getRuntime, withRuntime } from '../context';
import { color, confirm, println } from '../render';

interface DeleteOpts {
  yes?: boolean;
}

export function makeDeleteCommand(): Command {
  return new Command('delete')
    .alias('rm')
    .description('归档待办（移入历史记录，可在 archive 中恢复或永久删除）')
    .argument('<id...>', '待办 ID（支持前缀，可多个）')
    .option('-y, --yes', '跳过确认提示')
    .action(
      withRuntime(async (ids: string[], opts: DeleteOpts) => {
        const rt = getRuntime();
        rt.guardWrite();
        await rt.openReadOnly();
        // 先解析全部 id（输出预览）
        const todos = [];
        for (const input of ids) {
          todos.push(await resolveTodo(input));
        }
        println(color.yellow('将归档以下待办：'));
        for (const t of todos) {
          println(color.gray(`  • ${t.title}`));
        }
        if (!opts.yes) {
          const ok = await confirm(`确认归档 ${todos.length} 项？`, false);
          if (!ok) {
            println(color.gray('已取消'));
            return;
          }
        }
        // 切到读写模式执行
        await rt.openReadWrite();
        for (const todo of todos) {
          await deleteTodo(todo.id);
        }
        println(
          color.green(
            `已归档 ${todos.length} 项（可用 \`celery archive --list\` 查看，\`celery restore\` 恢复）`,
          ),
        );
      }),
    );
}
