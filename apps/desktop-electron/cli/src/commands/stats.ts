/**
 * @file celery stats —— 各项目统计概览
 */

import { Command } from 'commander';
import { getAllProjects, getAllTodos } from '../db';
import { getRuntime, withRuntime } from '../context';
import { color, printJson, println } from '../render';

export function makeStatsCommand(): Command {
  return new Command('stats').description('统计概览：各项目待办/完成数量').action(
    withRuntime(async () => {
      const rt = getRuntime();
      await rt.openReadOnly();
      const projects = await getAllProjects();
      const todos = await getAllTodos();

      const summary = projects.map((p) => {
        const items = todos.filter((t) => t.projectId === p.id);
        const completed = items.filter((t) => t.completed).length;
        const active = items.length - completed;
        return {
          project: p.name,
          total: items.length,
          active,
          completed,
        };
      });

      if (rt.json) {
        printJson(summary);
        return;
      }

      if (projects.length === 0) {
        println(color.gray('没有任何项目'));
        return;
      }

      const totalAll = summary.reduce((s, r) => s + r.total, 0);
      const completedAll = summary.reduce((s, r) => s + r.completed, 0);

      println(color.bold('统计概览'));
      println(color.gray('———————————————'));
      for (const r of summary) {
        const rate = r.total === 0 ? 0 : Math.round((r.completed / r.total) * 100);
        println(`  ${r.project}: ` + `${color.green(`${r.completed}/${r.total}`)} (${rate}%)`);
      }
      println(color.gray('———————————————'));
      println(color.bold(`合计: ${completedAll}/${totalAll} 完成`));
    }),
  );
}
