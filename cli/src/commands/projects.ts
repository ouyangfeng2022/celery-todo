/**
 * @file celery projects —— 项目管理
 */

import { Command } from 'commander';
import {
  deleteProject,
  generateId,
  getAllProjects,
  getAllTodos,
  insertProject,
  resolveProject,
} from '../db';
import { getRuntime, withRuntime } from '../context';
import { color, confirm, printJson, println, renderProjectList } from '../render';

interface ProjectsOpts {
  add?: string;
  delete?: string;
  color?: string;
  yes?: boolean;
}

const ALLOWED_COLORS = ['red', 'green', 'yellow', 'blue', 'purple', 'cyan', 'orange', 'gray'];

export function makeProjectsCommand(): Command {
  return new Command('projects')
    .alias('proj')
    .description('列出 / 新增 / 删除 项目')
    .option('--add <name>', '新建项目')
    .option('--delete <name|id>', '删除项目（连同其下所有待办与归档）')
    .option('-c, --color <name>', '项目颜色（与 --add 配合）')
    .option('-y, --yes', '跳过删除确认提示')
    .action(
      withRuntime(async (opts: ProjectsOpts) => {
        const rt = getRuntime();

        // 新增
        if (opts.add) {
          rt.guardWrite();
          rt.openReadWrite();
          if (opts.color && !ALLOWED_COLORS.includes(opts.color)) {
            throw new Error(`颜色必须是 ${ALLOWED_COLORS.join('/')} 之一`);
          }
          const now = new Date().toISOString();
          const project = {
            id: generateId(),
            name: opts.add.trim(),
            color: opts.color,
            createdAt: now,
            updatedAt: now,
            // 不指定 order：insertProject 的 COALESCE 会自动追加到末尾
          };
          insertProject(project);
          if (rt.json) {
            printJson(project);
            return;
          }
          println(color.green(`已创建项目「${project.name}」✓`));
          return;
        }

        // 删除
        if (opts.delete) {
          rt.guardWrite();
          rt.openReadOnly();
          const project = resolveProject(opts.delete);
          const todos = getAllTodos().filter((t) => t.projectId === project.id);
          println(
            color.yellow(`将删除项目「${project.name}」及其 ${todos.length} 个待办（含归档）`),
          );
          if (!opts.yes) {
            const ok = await confirm('确认删除项目？', false);
            if (!ok) {
              println(color.gray('已取消'));
              return;
            }
          }
          rt.openReadWrite();
          deleteProject(project.id);
          println(color.green('已删除项目 ✓'));
          return;
        }

        // 默认：列出
        rt.openReadOnly();
        const projects = getAllProjects();
        const todos = getAllTodos();
        const counts = new Map<string, { total: number; active: number; completed: number }>();
        for (const p of projects) counts.set(p.id, { total: 0, active: 0, completed: 0 });
        for (const t of todos) {
          const c = counts.get(t.projectId);
          if (!c) continue;
          c.total++;
          if (t.completed) c.completed++;
          else c.active++;
        }
        if (rt.json) {
          printJson(projects.map((p) => ({ ...p, ...counts.get(p.id) })));
          return;
        }
        println(renderProjectList(projects, counts));
      }),
    );
}
