/**
 * @file 存储位置网关
 * @description 仅封装 Electron 的文件位置 IPC，不加载 sql.js 或 renderer 数据库。
 */

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
  if (!window.electronAPI?.storageGetConfig) {
    return { mode: 'web', filePath: null, defaultDir: null };
  }
  try {
    const config = await window.electronAPI.storageGetConfig();
    return { mode: 'electron', filePath: config.filePath, defaultDir: config.defaultDir };
  } catch {
    return { mode: 'web', filePath: null, defaultDir: null };
  }
}

export async function chooseStorageDirectory(): Promise<string | null> {
  return window.electronAPI?.storageChooseDirectory?.() ?? null;
}

export async function changeStorageDirectory(newDir: string): Promise<string> {
  if (!window.electronAPI?.storageSetPath) {
    throw new Error('当前环境不支持自定义存储位置');
  }
  return (await window.electronAPI.storageSetPath(newDir)).filePath;
}

export async function resetStorageDirectory(): Promise<string> {
  if (!window.electronAPI?.storageResetToDefault) {
    throw new Error('当前环境不支持自定义存储位置');
  }
  return (await window.electronAPI.storageResetToDefault()).filePath;
}

export async function openStorageInFolder(): Promise<void> {
  await window.electronAPI?.storageOpenInFolder?.();
}
