/**
 * @file celery add —— 新建待办
 */

import { Command } from 'commander';
import { addTodo, getAllProjects, resolveProject } from '../db';
import { getRuntime, withRuntime } from '../context';
import { color, printJson, println } from '../render';
import { normalizePriority } from '../types';

interface AddOpts {
  project?: string;
  priority?: string;
  desc?: string;
}

export function makeAddCommand(): Command {
  return new Command('add')
    .description('新建一个待办')
    .argument('<title...>', '待办标题（多段空格会拼为一行）')
    .option('-p, --project <name|id>', '目标项目（名称/id/前缀）')
    .option('--priority <level>', '优先级: high|medium|low（默认 medium）')
    .option('--desc <text>', '描述')
    .action(
      withRuntime(async (titleParts: string[], opts: AddOpts) => {
        const rt = getRuntime();
        await rt.openReadWrite();

        const title = titleParts.join(' ').trim();
        if (!title) throw new Error('标题不能为空');

        // 解析项目：未指定时，若仅有一个项目则默认归它，否则要求显式指定
        const projects = await getAllProjects();
        if (projects.length === 0) {
          throw new Error('没有任何项目。请先在 App 中创建项目，或用 `celery projects --add` 新建');
        }
        let projectId: string;
        if (opts.project) {
          projectId = (await resolveProject(opts.project)).id;
        } else if (projects.length === 1) {
          projectId = projects[0].id;
          println(color.gray(`（未指定项目，归入唯一项目「${projects[0].name}」）`));
        } else {
          throw new Error(
            '存在多个项目，请用 -p <名称|id> 指定目标。运行 `celery projects` 查看列表',
          );
        }

        const result = await addTodo({
          projectId,
          title,
          description: opts.desc?.trim() || undefined,
          priority: normalizePriority(opts.priority),
        });

        if (rt.json) {
          printJson({ id: result.id, projectId, title });
          return;
        }
        println(color.green('已创建 ✓'));
        println(color.gray(`ID: ${result.id}`));
        void projects; // 保持 projects 变量引用（详情展示已精简）
      }),
    );
}
