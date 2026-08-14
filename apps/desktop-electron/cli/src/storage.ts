/**
 * @file 数据库路径定位
 * @description 复刻 electron/storage.ts + electron/main.ts 中确定 DB 文件位置的逻辑，
 *              但脱离 Electron 运行时，直接用 node:path + 环境变量推算 userData 根目录。
 *
 * 路径优先级（resolveDbPath）：
 *   1. 显式 --db <path>          （来自 CLI 选项，最高）
 *   2. CELERY_TODO_DB 环境变量   （便于脚本/CI 覆盖）
 *   3. storage-config.json.dataDir + DB_FILENAME
 *   4. 自动探测：依次检查候选 userData 目录，命中第一个存在 storage-config.json 或
 *      data/DB_FILENAME 的目录作为依据
 *
 * 关于 userData 目录名：
 * - 生产打包版（electron-builder）：Electron 用 productName → "Celery Todo"（带空格）。
 * - 开发版（bun run electron:dev）：Electron 用 package.json name → "celery-todo"
 *   （小写连字符，见 electron/main.ts 注释与实际目录）。
 * 为兼容两者，CLI 维护候选目录列表，按「已存在且含数据」优先选择。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { StorageInfo } from './types';

/** 应用产品名（与 package.json productName、electron-builder 一致；打包版 userData 用此名） */
export const APP_PRODUCT_NAME = 'Celery Todo';

/** 应用 package 名（开发版 userData 用此名，小写连字符） */
export const APP_PACKAGE_NAME = 'celery-todo';

/** 数据库文件名（与 electron/storage.ts 一致） */
export const DB_FILENAME = 'celery-todo.db';

/** 存储位置配置文件名（始终位于 userData 根目录） */
const CONFIG_FILENAME = 'storage-config.json';

/**
 * 推算 Electron 默认 userData 根目录的「父目录」与「目录名集合」。
 * Electron 在各平台使用如下约定（app.setName 后）：
 *   - Windows: %APPDATA%\<name>
 *   - macOS:   ~/Library/Application Support/<name>
 *   - Linux:   ~/.config/<name>
 */
function getUserDataParent(): string {
  const platform = process.platform;
  const home = os.homedir();
  if (platform === 'win32') {
    return process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  }
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support');
  }
  return process.env.XDG_CONFIG_HOME || path.join(home, '.config');
}

/** 候选 userData 目录名（按优先级：打包版优先，开发版兜底） */
const USER_DATA_NAMES = [APP_PRODUCT_NAME, APP_PACKAGE_NAME];

/**
 * 返回所有候选 userData 目录（不一定存在）。
 */
export function getCandidateUserDataDirs(): string[] {
  const parent = getUserDataParent();
  return USER_DATA_NAMES.map((name) => path.join(parent, name));
}

/**
 * 选定实际使用的 userData 目录：
 * - 优先返回含 storage-config.json 或 data/DB_FILENAME 的目录
 * - 都不存在时回退到第一个候选（productName，与打包版默认一致）
 */
export function getUserDataDir(): string {
  const candidates = getCandidateUserDataDirs();
  for (const dir of candidates) {
    if (
      fs.existsSync(path.join(dir, CONFIG_FILENAME)) ||
      fs.existsSync(path.join(dir, 'data', DB_FILENAME))
    ) {
      return dir;
    }
  }
  return candidates[0];
}

/** 默认数据目录：userData/data */
export function getDefaultDataDir(): string {
  return path.join(getUserDataDir(), 'data');
}

/** storage-config.json 路径：始终在 userData 根目录 */
function getConfigPath(): string {
  return path.join(getUserDataDir(), CONFIG_FILENAME);
}

/**
 * 读取存储配置。文件缺失或损坏时回退到默认目录。
 * 行为与 electron/storage.ts readConfig 完全一致。
 */
export function readStorageConfig(): { dataDir: string; customized: boolean } {
  const defaultDir = getDefaultDataDir();
  try {
    const cfgPath = getConfigPath();
    if (fs.existsSync(cfgPath)) {
      const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as { dataDir?: unknown };
      if (raw && typeof raw.dataDir === 'string' && raw.dataDir.trim()) {
        const dataDir = raw.dataDir;
        // 自定义判定：与默认目录规范化路径不同即视为自定义
        const customized = path.resolve(dataDir) !== path.resolve(defaultDir);
        return { dataDir, customized };
      }
    }
  } catch {
    // 配置文件损坏时回退到默认（与 electron 行为一致）
  }
  return { dataDir: defaultDir, customized: false };
}

/**
 * 解析最终的数据库文件路径。
 *
 * @param overridePath 显式覆盖（--db 选项）；为空时查环境变量；再降级到 config。
 * @returns 解析得到的绝对路径（不保证文件存在）
 */
export function resolveDbPath(overridePath?: string): string {
  if (overridePath && overridePath.trim()) {
    return path.resolve(overridePath.trim());
  }
  const envPath = process.env.CELERY_TODO_DB;
  if (envPath && envPath.trim()) {
    return path.resolve(envPath.trim());
  }
  const { dataDir } = readStorageConfig();
  return path.join(dataDir, DB_FILENAME);
}

/**
 * 收集存储信息（供 `celery config` 命令展示）。
 * 显式覆盖优先；否则展示 config 解析结果。
 */
export function getStorageInfo(overridePath?: string): StorageInfo {
  if (overridePath && overridePath.trim()) {
    return {
      filePath: path.resolve(overridePath.trim()),
      defaultDir: getDefaultDataDir(),
      customized: true,
    };
  }
  const envPath = process.env.CELERY_TODO_DB;
  if (envPath && envPath.trim()) {
    return {
      filePath: path.resolve(envPath.trim()),
      defaultDir: getDefaultDataDir(),
      customized: true,
    };
  }
  const { dataDir, customized } = readStorageConfig();
  return {
    filePath: path.join(dataDir, DB_FILENAME),
    defaultDir: getDefaultDataDir(),
    customized,
  };
}

/** 检查数据库文件是否存在于磁盘 */
export function dbFileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
