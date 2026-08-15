/**
 * @file 存储位置网关（Tauri storage 命令的 renderer 出口）
 * @description 自定义数据目录（storageRelocation 能力）：路径展示、选目录、
 *              热切换迁移（Rust 侧 checkpoint + 拷贝 + 配置回滚，见
 *              src-tauri/src/storage.rs）、重置回默认、在文件管理器中定位。
 *              非 Tauri 环境（jsdom 单测 / 浏览器）保持 web 桩语义，
 *              设置页据此自动隐藏存储位置区块。
 */

import { invoke } from '@tauri-apps/api/core';

import { capabilities, isTauri } from '../platform';

/** 存储位置信息 */
export interface StorageInfo {
  /** 当前持久化模式（native = Tauri 宿主本地文件） */
  mode: 'native' | 'web';
  /** 当前数据库文件完整路径（仅 native 模式有值） */
  filePath: string | null;
  /** 默认数据目录（仅 native 模式有值） */
  defaultDir: string | null;
}

/** Rust storage_info 的返回结构（serde camelCase）。 */
interface StorageInfoDto {
  filePath: string;
  defaultDir: string;
  customized: boolean;
}

/** 把 invoke 的 ErrorPayload 还原成带 message 的 Error（DataSection alert 展示）。 */
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    const message =
      typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err);
    throw new Error(message);
  }
}

export async function getStorageInfo(): Promise<StorageInfo> {
  if (!capabilities.storageRelocation) {
    return { mode: 'web', filePath: null, defaultDir: null };
  }
  const info = await call<StorageInfoDto>('storage_info');
  return { mode: 'native', filePath: info.filePath, defaultDir: info.defaultDir };
}

export async function chooseStorageDirectory(): Promise<string | null> {
  if (!isTauri) return null;
  return call<string | null>('storage_choose_directory');
}

/** 切换存储目录并迁移数据；返回新数据库文件路径。 */
export async function changeStorageDirectory(newDir: string): Promise<string> {
  return call<string>('storage_set_path', { newDir });
}

/** 重置为默认存储位置（数据随迁）；返回数据库文件路径。 */
export async function resetStorageDirectory(): Promise<string> {
  return call<string>('storage_reset_to_default');
}

export async function openStorageInFolder(): Promise<void> {
  if (!isTauri) return;
  await call<void>('storage_open_in_folder');
}
