/**
 * @file celery due —— 设置/清除截止日期
 */

import { Command } from 'commander';
import { resolveTodo, updateTodo } from '../db';
import { getRuntime, withRuntime } from '../context';
import { color, dueLabel, println } from '../render';
import { parseDueDate } from './add';

export function makeDueCommand(): Command {
  return new Command('due')
    .description('设置截止日期（YYYY-MM-DD），传 clear 清除')
    .argument('<id>', '待办 ID（支持前缀）')
    .argument('[date]', 'YYYY-MM-DD 或 "clear"')
    .action(
      withRuntime((idInput: string, dateInput: string | undefined) => {
        const rt = getRuntime();
        rt.guardWrite();
        rt.openReadWrite();
        const todo = resolveTodo(idInput);
        // parseDueDate('clear') → undefined；无参时视为清除
        const dueDate = parseDueDate(dateInput === undefined ? 'clear' : dateInput);
        updateTodo({
          ...todo,
          dueDate,
          updatedAt: new Date().toISOString(),
        });
        if (dueDate) {
          println(
            color.green('已设置截止日期 ✓ ') + color.gray(`${todo.title} → ${dueLabel(dueDate)}`),
          );
        } else {
          println(color.green('已清除截止日期 ✓ ') + color.gray(todo.title));
        }
      }),
    );
}
