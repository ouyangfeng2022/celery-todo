/**
 * @file celery config —— 展示数据库路径、存储模式、schema 版本
 */

import { Command } from 'commander';
import { getDataVersion, getSetting } from '../db';
import { dbFileExists, getStorageInfo } from '../storage';
import { getRuntime, withRuntime } from '../context';
import { color, println } from '../render';

export function makeConfigCommand(): Command {
  return new Command('config').description('展示数据库路径、存储配置与 schema 版本').action(
    withRuntime(() => {
      const rt = getRuntime();
      const info = getStorageInfo(rt.db);
      const exists = dbFileExists(info.filePath);

      println(color.bold('存储信息'));
      println(color.gray('———————————————'));
      println(`${color.gray('数据库路径:')}  ${info.filePath}`);
      println(
        `${color.gray('文件状态:')}    ${exists ? color.green('存在') : color.red('不存在')}`,
      );
      println(
        `${color.gray('存储位置:')}    ${
          info.customized ? color.yellow('自定义') : color.gray('默认')
        }`,
      );
      println(`${color.gray('默认目录:')}    ${info.defaultDir}`);
      println(
        `${color.gray('环境变量:')}    ${process.env.CELERY_TODO_DB ?? color.gray('（未设置 CELERY_TODO_DB）')}`,
      );

      if (exists) {
        // 文件存在才尝试打开读取 schema 版本
        try {
          rt.openReadOnly();
          const dv = getDataVersion();
          println(`${color.gray('Schema 版本:')} ${dv ?? color.red('未知（缺少 dataVersion）')}`);
          println(
            `${color.gray('主题:')}        ${getSetting('theme') ?? color.gray('（默认 system）')}`,
          );
          println(
            `${color.gray('聚焦模式:')}    ${getSetting('focusMode') ?? color.gray('（默认开启）')}`,
          );
        } catch (err) {
          println(color.red(`读取失败: ${err instanceof Error ? err.message : String(err)}`));
        }
      }
      println('');
      println(
        color.gray('路径优先级: --db 选项 > CELERY_TODO_DB 环境变量 > storage-config.json > 默认'),
      );
    }),
  );
}
