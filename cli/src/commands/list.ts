/**
 * @file celery list —— 列出待办
 */

import { Command } from 'commander';
import { getAllProjects, getAllTodos, getTodosByProject, resolveProject } from '../db';
import { getRuntime, withRuntime } from '../context';
import { color, printJson, println, renderTodoTable } from '../render';
import type { Todo } from '../types';

interface ListOpts {
  project?: string;
  all?: boolean;
  done?: boolean;
  active?: boolean;
  overdue?: boolean;
}

export function makeListCommand(): Command {
  return new Command('list')
    .alias('ls')
    .description('列出待办（默认隐藏已完成；加 --done 显示已完成；--all 跨项目）')
    .option('-p, --project <name|id>', '筛选指定项目（名称/id/前缀）')
    .option('-a, --all', '显示包含已完成在内的全部待办')
    .option('--done', '仅显示已完成')
    .option('--active', '仅显示未完成')
    .option('--overdue', '仅显示已逾期且未完成')
    .action(
      withRuntime(async (opts: ListOpts) => {
        const rt = getRuntime();
        await rt.openReadOnly();
        const projects = await getAllProjects();

        let todos: Todo[];
        if (opts.project) {
          const project = await resolveProject(opts.project);
          todos = await getTodosByProject(project.id);
        } else {
          todos = await getAllTodos();
        }

        if (opts.overdue) {
          const now = Date.now();
          todos = todos.filter(
            (t) => !t.completed && !!t.dueDate && new Date(t.dueDate).getTime() < now,
          );
        } else if (opts.done) {
          todos = todos.filter((t) => t.completed);
        } else if (opts.active) {
          todos = todos.filter((t) => !t.completed);
        } else if (!opts.all) {
          // 默认隐藏已完成
          todos = todos.filter((t) => !t.completed);
        }

        if (rt.json) {
          printJson(todos);
          return;
        }

        if (todos.length === 0) {
          println(color.gray('没有匹配的待办 🎉'));
          return;
        }
        println(renderTodoTable(todos, projects));
        println(color.gray(`\n共 ${todos.length} 项`));
      }),
    );
}
