/**
 * @file 命令运行时：全局选项 + 模式探测 + 数据库打开/守卫
 * @description 双模式 CLI 的统一运行时。index.ts 在解析后调用 setGlobalOptions() 注入；
 *              命令体通过 getRuntime() 取用。
 *
 * 模式（mode）：
 *   - 'ipc'    GUI 运行中，经 socket/管道调用渲染进程 store action（实时刷新 GUI）
 *   - 'direct' GUI 未运行，用 better-sqlite3 直连文件（离线回退）
 *
 * guardWrite 行为：
 *   - 'ipc' 模式：CLI 不写文件（写入经 GUI），跳过进程检测
 *   - 'direct' 模式：写文件前 best-effort 检测 GUI 进程，命中则阻止（--force 跳过）
 */

import { closeDatabase, openDatabase, resolveMode, type Mode } from './db';
import { ensureSafeToWrite } from './process-check';
import { resolveDbPath } from './storage';

/** 全局选项（定义在顶层 program 上） */
export interface GlobalOptions {
  /** 显式 DB 路径覆盖（仅 direct 模式用） */
  db?: string;
  /** 跳过进程检测（仅 direct 模式用） */
  force?: boolean;
  /** 输出 JSON 而非表格 */
  json?: boolean;
}

let current: GlobalOptions = {};

/** 由 index.ts 在解析后调用，注入全局选项 */
export function setGlobalOptions(opts: GlobalOptions): void {
  current = opts;
}

/**
 * 模式探测：在 preAction 钩子调用一次，缓存到 module 变量。
 * 失败（socket 连不上）静默回退 'direct'，不报错。
 */
let resolvedMode: Mode | null = null;

export async function ensureModeResolved(): Promise<Mode> {
  if (!resolvedMode) {
    resolvedMode = await resolveMode();
  }
  return resolvedMode;
}

export function getResolvedMode(): Mode | null {
  return resolvedMode;
}

/** 运行时：每个命令体内使用 */
export interface Runtime extends GlobalOptions {
  /** 当前模式 */
  mode: Mode;
  /** 以读写模式打开数据库（direct 模式）；IPC 模式下空操作 */
  openReadWrite: () => Promise<void>;
  /** 以只读模式打开数据库（direct 模式）；IPC 模式下空操作 */
  openReadOnly: () => Promise<void>;
  /** 写前置守卫：direct 模式检测 GUI 进程，IPC 模式或 --force 跳过 */
  guardWrite: () => void;
}

export function getRuntime(): Runtime {
  if (!resolvedMode) {
    throw new Error('运行时未初始化：请确保 index.ts 已注册 preAction 钩子调用 ensureModeResolved');
  }
  const opts = current;
  const mode = resolvedMode;
  return {
    ...opts,
    mode,
    openReadWrite: async () => {
      if (mode === 'ipc') return;
      openDatabase(resolveDbPath(opts.db), false);
    },
    openReadOnly: async () => {
      if (mode === 'ipc') return;
      openDatabase(resolveDbPath(opts.db), true);
    },
    guardWrite: () => {
      // IPC 模式：CLI 不写文件，无需检测
      if (mode === 'ipc') return;
      ensureSafeToWrite(Boolean(opts.force));
    },
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
