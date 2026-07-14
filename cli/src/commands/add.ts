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
  due?: string;
  desc?: string;
}

export function makeAddCommand(): Command {
  return new Command('add')
    .description('新建一个待办')
    .argument('<title...>', '待办标题（多段空格会拼为一行）')
    .option('-p, --project <name|id>', '目标项目（名称/id/前缀）')
    .option('--priority <level>', '优先级: high|medium|low（默认 medium）')
    .option('--due <YYYY-MM-DD>', '截止日期（YYYY-MM-DD 或 ISO）')
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

        const dueDate = parseDueDate(opts.due);
        const result = await addTodo({
          projectId,
          title,
          description: opts.desc?.trim() || undefined,
          priority: normalizePriority(opts.priority),
          dueDate,
        });

        if (rt.json) {
          printJson({ id: result.id, projectId, title, dueDate });
          return;
        }
        println(color.green('已创建 ✓'));
        println(color.gray(`ID: ${result.id}`));
        void projects; // 保持 projects 变量引用（详情展示已精简）
      }),
    );
}

/** 解析 --due：接受 YYYY-MM-DD（按本地时区转为当日 00:00）或完整 ISO；非法时报错 */
export function parseDueDate(input?: string): string | undefined {
  if (!input) return undefined;
  if (input === 'clear') return undefined;
  // YYYY-MM-DD
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (ymd) {
    const [, y, m, d] = ymd;
    return new Date(Number(y), Number(m) - 1, Number(d)).toISOString();
  }
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`无法解析日期 "${input}"，请使用 YYYY-MM-DD 或 ISO 格式`);
  }
  return parsed.toISOString();
}
