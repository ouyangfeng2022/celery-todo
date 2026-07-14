/**
 * @file celery archive —— 回收站（历史记录）管理
 */

import { Command } from 'commander';
import { emptyArchive, getAllDeletedTodos, restoreTodo } from '../db';
import { getRuntime, withRuntime } from '../context';
import { color, confirm, printJson, println, renderArchiveTable } from '../render';

interface ArchiveOpts {
  list?: boolean;
  clean?: boolean;
  restoreAll?: boolean;
  yes?: boolean;
}

export function makeArchiveCommand(): Command {
  return new Command('archive')
    .description('回收站（历史记录）管理：默认列出全部归档项')
    .option('-l, --list', '列出归档项（默认行为）')
    .option('--clean', '永久清空全部归档（不可恢复）')
    .option('--restore-all', '恢复全部归档项到 todos')
    .option('-y, --yes', '跳过确认提示')
    .action(
      withRuntime(async (opts: ArchiveOpts) => {
        const rt = getRuntime();

        // --clean：永久清空
        if (opts.clean) {
          rt.guardWrite();
          await rt.openReadOnly();
          const count = (await getAllDeletedTodos()).length;
          if (count === 0) {
            println(color.gray('回收站为空'));
            return;
          }
          println(color.yellow(`将永久删除 ${count} 项归档，此操作不可恢复`));
          if (!opts.yes) {
            const ok = await confirm('确认清空？', false);
            if (!ok) {
              println(color.gray('已取消'));
              return;
            }
          }
          await rt.openReadWrite();
          await emptyArchive('all');
          println(color.green('回收站已清空'));
          return;
        }

        // --restore-all：批量恢复
        if (opts.restoreAll) {
          rt.guardWrite();
          await rt.openReadOnly();
          const all = await getAllDeletedTodos();
          if (all.length === 0) {
            println(color.gray('回收站为空'));
            return;
          }
          await rt.openReadWrite();
          for (const it of all) {
            await restoreTodo(it.id);
          }
          println(color.green(`已恢复 ${all.length} 项`));
          return;
        }

        // 默认：列出归档
        await rt.openReadOnly();
        const items = await getAllDeletedTodos();
        if (rt.json) {
          printJson(items);
          return;
        }
        if (items.length === 0) {
          println(color.gray('回收站为空'));
          return;
        }
        println(renderArchiveTable(items));
        println(color.gray(`\n共 ${items.length} 项。用 \`celery restore <id>\` 恢复单项`));
      }),
    );
}
