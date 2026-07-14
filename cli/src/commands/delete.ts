/**
 * @file celery delete —— 软删除（移入回收站/历史记录）
 */

import { Command } from 'commander';
import { resolveTodo, softDeleteTodo } from '../db';
import { getRuntime, withRuntime } from '../context';
import { color, confirm, println } from '../render';

interface DeleteOpts {
  yes?: boolean;
}

export function makeDeleteCommand(): Command {
  return new Command('delete')
    .alias('rm')
    .description('删除待办（移入回收站，30 天后保留为历史记录）')
    .argument('<id...>', '待办 ID（支持前缀，可多个）')
    .option('-y, --yes', '跳过确认提示')
    .action(
      withRuntime(async (ids: string[], opts: DeleteOpts) => {
        const rt = getRuntime();
        rt.guardWrite();
        rt.openReadOnly();
        // 先只读解析全部 id（输出预览）
        const todos = ids.map((input) => resolveTodo(input));
        println(color.yellow('将删除以下待办：'));
        for (const t of todos) {
          println(color.gray(`  • ${t.title}`));
        }
        if (!opts.yes) {
          const ok = await confirm(`确认删除 ${todos.length} 项？`, false);
          if (!ok) {
            println(color.gray('已取消'));
            return;
          }
        }
        // 切到读写模式执行
        rt.openReadWrite();
        const now = new Date().toISOString();
        const expires = new Date(Date.now() + 30 * 86400000).toISOString();
        for (const todo of todos) {
          softDeleteTodo(todo, now, expires);
        }
        println(
          color.green(
            `已删除 ${todos.length} 项（可用 \`celery archive --list\` 查看，\`celery restore\` 恢复）`,
          ),
        );
      }),
    );
}
