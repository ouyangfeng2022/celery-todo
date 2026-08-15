/**
 * @file celery config —— 展示运行模式、数据库路径、存储配置与 schema 版本
 */

import { Command } from 'commander';
import { getDataVersion, getSetting } from '../db';
import { getCliEndpoint } from '../ipc';
import { dbFileExists, getStorageInfo } from '../storage';
import { getRuntime, withRuntime } from '../context';
import { color, println } from '../render';

export function makeConfigCommand(): Command {
  return new Command('config')
    .description('展示运行模式、数据库路径、存储配置与 schema 版本')
    .action(
      withRuntime(async () => {
        const rt = getRuntime();
        const endpoint = getCliEndpoint();
        const info = getStorageInfo(rt.db);

        // === 运行模式 ===
        println(color.bold('运行模式'));
        println(color.gray('———————————————'));
        if (rt.mode === 'ipc') {
          println(
            `${color.gray('模式:')}        ${color.green('IPC')} ${color.gray('（GUI 运行中，经 socket/管道实时通信）')}`,
          );
        } else {
          println(
            `${color.gray('模式:')}        ${color.yellow('直连')} ${color.gray('（GUI 未运行，CLI 直接读写文件）')}`,
          );
        }
        println(`${color.gray('通信端点:')}  ${endpoint}`);
        println('');

        // === 存储信息 ===
        const exists = dbFileExists(info.filePath);
        println(color.bold('存储信息'));
        println(color.gray('———————————————'));
        println(`${color.gray('数据库路径:')}  ${info.filePath}`);
        println(
          `${color.gray('文件状态:')}    ${exists ? color.green('存在') : color.red('不存在')}`,
        );
        println(
          `${color.gray('存储位置:')}    ${info.customized ? color.yellow('自定义') : color.gray('默认')}`,
        );
        println(`${color.gray('默认目录:')}    ${info.defaultDir}`);
        println(
          `${color.gray('环境变量:')}    ${process.env.CELERY_TODO_DB ?? color.gray('（未设置 CELERY_TODO_DB）')}`,
        );

        // === schema / 设置（IPC 模式问 GUI；直连模式读文件）===
        try {
          await rt.openReadOnly();
          const dv = await getDataVersion();
          println(`${color.gray('Schema 版本:')} ${dv ?? color.red('未知（缺少 dataVersion）')}`);
          println(
            `${color.gray('主题:')}        ${(await getSetting('theme')) ?? color.gray('（默认 system）')}`,
          );
          println(
            `${color.gray('聚焦模式:')}    ${(await getSetting('focusMode')) ?? color.gray('（默认开启）')}`,
          );
        } catch (err) {
          println(color.red(`读取失败: ${err instanceof Error ? err.message : String(err)}`));
        }

        println('');
        if (rt.mode === 'ipc') {
          println(color.green('✓ CLI 操作将实时同步到 GUI'));
        } else {
          println(color.gray('提示：启动 GUI 后 CLI 会自动切换到 IPC 模式，操作实时反映到界面。'));
        }
        println(
          color.gray(
            '路径优先级: --db 选项 > CELERY_TODO_DB 环境变量 > storage-config.json > 默认',
          ),
        );
      }),
    );
}
