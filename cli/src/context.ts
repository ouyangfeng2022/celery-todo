/**
 * @file 命令运行时：全局选项 + 数据库打开/守卫
 * @description index.ts 在 program 解析后调用 setGlobalOptions() 注入；
 *              各命令通过 getRuntime() 取用。这样避免每个子命令动作里
 *              都要穿透 commander 的 options 链。
 */

import { closeDatabase, openDatabase } from './db';
import { ensureSafeToWrite } from './process-check';
import { resolveDbPath } from './storage';

/** 全局选项（定义在顶层 program 上） */
export interface GlobalOptions {
  /** 显式 DB 路径覆盖 */
  db?: string;
  /** 跳过进程检测 */
  force?: boolean;
  /** 输出 JSON 而非表格 */
  json?: boolean;
}

let current: GlobalOptions = {};

/** 由 index.ts 在解析后调用，注入全局选项 */
export function setGlobalOptions(opts: GlobalOptions): void {
  current = opts;
}

/** 运行时：每个命令体内使用 */
export interface Runtime extends GlobalOptions {
  /** 以读写模式打开数据库（写入命令用） */
  openReadWrite(): string;
  /** 以只读模式打开数据库（查询命令用） */
  openReadOnly(): string;
  /** 写前置守卫：检测 App 是否运行，已 --force 则跳过 */
  guardWrite(): void;
}

export function getRuntime(): Runtime {
  const opts = current;
  return {
    ...opts,
    openReadWrite: () => {
      const p = resolveDbPath(opts.db);
      openDatabase(p, false);
      return p;
    },
    openReadOnly: () => {
      const p = resolveDbPath(opts.db);
      openDatabase(p, true);
      return p;
    },
    guardWrite: () => ensureSafeToWrite(Boolean(opts.force)),
  };
}

/**
 * 包装命令动作：统一错误捕获 + 数据库关闭 + 退出码。
 * 每个命令只关心业务，错误直接 throw。
 */
export function withRuntime<T extends (...args: never[]) => unknown>(fn: T): T {
  const wrapped = (...args: Parameters<T>): ReturnType<T> => {
    try {
      const result = fn(...args);
      // 异步命令：挂载 finally 关库
      if (result instanceof Promise) {
        return result.finally(() => closeDatabase()) as unknown as ReturnType<T>;
      }
      closeDatabase();
      return result as ReturnType<T>;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('\x1b[31m错误:\x1b[39m ' + msg);
      process.exitCode = 1;
      closeDatabase();
      return undefined as unknown as ReturnType<T>;
    }
  };
  return wrapped as T;
}
