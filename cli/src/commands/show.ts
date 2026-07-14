/**
 * @file celery show —— 查看单条待办详情
 */

import { Command } from 'commander';
import { getProjectById, resolveTodo } from '../db';
import { getRuntime, withRuntime } from '../context';
import { printJson, println, renderTodoDetail } from '../render';

export function makeShowCommand(): Command {
  return new Command('show')
    .description('查看一条待办的详情')
    .argument('<id>', '待办 ID（支持前缀）')
    .action(
      withRuntime((idInput: string) => {
        const rt = getRuntime();
        rt.openReadOnly();
        const todo = resolveTodo(idInput);
        const project = getProjectById(todo.projectId) ?? undefined;
        if (rt.json) {
          printJson(todo);
          return;
        }
        println(renderTodoDetail(todo, project));
      }),
    );
}
