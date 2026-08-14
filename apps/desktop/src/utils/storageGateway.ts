/**
 * @file 存储位置网关（3.0 阶段 A 桩）
 * @description 2.x 的自定义数据目录依赖 Electron 主进程文件迁移；Tauri 侧
 *              在阶段 B（平台能力）经 tauri-plugin-dialog/fs 重新实现。
 *              在此之前 getStorageInfo 恒返回不可定制状态，设置页自动隐藏
 *              存储位置区块，导入/导出/重置不受影响。
 */

import { capabilities } from '../platform';

/** 存储位置信息 */
export interface StorageInfo {
  /** 当前持久化模式 */
  mode: 'electron' | 'web';
  /** 当前数据库文件完整路径（仅 Electron 模式有值） */
  filePath: string | null;
  /** 默认数据目录（仅 Electron 模式有值） */
  defaultDir: string | null;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  if (!capabilities.storageRelocation) {
    return { mode: 'web', filePath: null, defaultDir: null };
  }
  // 阶段 B：Rust 命令返回 appData 下的真实路径
  return { mode: 'web', filePath: null, defaultDir: null };
}

export async function chooseStorageDirectory(): Promise<string | null> {
  return null;
}

export async function changeStorageDirectory(_newDir: string): Promise<string> {
  throw new Error('当前环境不支持自定义存储位置');
}

export async function resetStorageDirectory(): Promise<string> {
  throw new Error('当前环境不支持自定义存储位置');
}

export async function openStorageInFolder(): Promise<void> {}
