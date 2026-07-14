/**
 * @file celery stats —— 各项目统计概览
 */

import { Command } from 'commander';
import { getAllProjects, getAllTodos } from '../db';
import { getRuntime, withRuntime } from '../context';
import { color, printJson, println } from '../render';

export function makeStatsCommand(): Command {
  return new Command('stats').description('统计概览：各项目待办/完成/逾期数量').action(
    withRuntime(() => {
      const rt = getRuntime();
      rt.openReadOnly();
      const projects = getAllProjects();
      const todos = getAllTodos();
      const now = Date.now();

      const summary = projects.map((p) => {
        const items = todos.filter((t) => t.projectId === p.id);
        const completed = items.filter((t) => t.completed).length;
        const active = items.length - completed;
        const overdue = items.filter(
          (t) => !t.completed && !!t.dueDate && new Date(t.dueDate).getTime() < now,
        ).length;
        return {
          project: p.name,
          total: items.length,
          active,
          completed,
          overdue,
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
      const overdueAll = summary.reduce((s, r) => s + r.overdue, 0);

      println(color.bold('统计概览'));
      println(color.gray('———————————————'));
      for (const r of summary) {
        const rate = r.total === 0 ? 0 : Math.round((r.completed / r.total) * 100);
        println(
          `  ${r.project}: ` +
            `${color.green(`${r.completed}/${r.total}`)} (${rate}%)` +
            (r.overdue > 0 ? color.red(`  ⚠ ${r.overdue} 逾期`) : ''),
        );
      }
      println(color.gray('———————————————'));
      println(
        color.bold(`合计: ${completedAll}/${totalAll} 完成`) +
          (overdueAll > 0 ? color.red(`   ⚠ ${overdueAll} 逾期`) : ''),
      );
    }),
  );
}
