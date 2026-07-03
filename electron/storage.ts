/**
 * @file 数据存储位置 IPC 模块
 * @description 将 SQLite 二进制持久化到真实的本地文件，支持自定义存储位置。
 *              配置文件 storage-config.json 始终保存在 userData 下，记录当前
 *              数据文件路径；切换位置时自动迁移已有数据。
 */

import { app, ipcMain, dialog, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// 常量
// ============================================

/** 数据库文件名（在存储目录内） */
const DB_FILENAME = 'celery-todo.db';

/** 存储位置配置文件名（始终位于 userData 下） */
const CONFIG_FILENAME = 'storage-config.json';

// ============================================
// 路径辅助
// ============================================

/** 默认数据目录：userData/data */
function getDefaultDataDir(): string {
  return path.join(app.getPath('userData'), 'data');
}

/** 配置文件路径：始终在 userData 根目录 */
function getConfigPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILENAME);
}

/** 读取存储配置 */
function readConfig(): { dataDir: string } {
  const defaultCfg = { dataDir: getDefaultDataDir() };
  try {
    const cfgPath = getConfigPath();
    if (fs.existsSync(cfgPath)) {
      const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      if (raw && typeof raw.dataDir === 'string' && raw.dataDir.trim()) {
        return { dataDir: raw.dataDir };
      }
    }
  } catch {
    // 配置文件损坏时回退到默认
  }
  return defaultCfg;
}

/** 写入存储配置 */
function writeConfig(cfg: { dataDir: string }): void {
  const cfgPath = getConfigPath();
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
}

/** 获取当前数据文件的完整路径 */
function getCurrentDbPath(): string {
  return path.join(readConfig().dataDir, DB_FILENAME);
}

// ============================================
// 文件读写（原子写入避免损坏）
// ============================================

/** 读取数据库二进制；文件不存在返回 null */
function readDbFile(): Uint8Array | null {
  const filePath = getCurrentDbPath();
  if (!fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);
  // 转换为标准 Uint8Array，避免 ipc 返回 Buffer 引发渲染端类型混淆
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/**
 * 原子写入数据库二进制：先写到同目录临时文件，再 rename 替换。
 * 这样即便写入途中崩溃，原有文件仍保持完整。
 */
function writeDbFile(data: Uint8Array): void {
  const filePath = getCurrentDbPath();
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const tmpPath = `${filePath}.${process.pid}.tmp`;
  // 直接写 Buffer，避免 Uint8Array 在 fs 中可能的字节偏移问题
  fs.writeFileSync(tmpPath, Buffer.from(data));
  // rename 在同分区下是原子操作（Windows 同盘也是）
  fs.renameSync(tmpPath, filePath);
}

// ============================================
// 位置切换 / 迁移
// ============================================

/**
 * 切换数据存储目录。
 * 流程：创建新目录 → 拷贝旧文件（如果存在）→ 更新配置 → 删除旧文件
 * 任一步失败则抛出，配置不更新，原位置保持可用。
 */
function switchDataDir(newDir: string): { filePath: string } {
  const normalized = path.resolve(newDir);
  const oldPath = getCurrentDbPath();

  // 1. 确保新目录存在且可写
  fs.mkdirSync(normalized, { recursive: true });
  const testFile = path.join(normalized, `.celery-write-test-${Date.now()}`);
  try {
    fs.writeFileSync(testFile, '');
    fs.unlinkSync(testFile);
  } catch (err) {
    throw new Error(`目标目录不可写: ${normalized}`);
  }

  // 2. 如果新目录已有同名数据库文件，警告并拒绝（避免覆盖用户其他数据）
  const newPath = path.join(normalized, DB_FILENAME);
  if (fs.existsSync(newPath) && path.resolve(oldPath) !== path.resolve(newPath)) {
    throw new Error('目标目录已存在同名数据文件，请选择空目录或换一个位置。');
  }

  // 3. 拷贝旧文件到新位置
  const hasOldData = fs.existsSync(oldPath);
  if (hasOldData && path.resolve(oldPath) !== path.resolve(newPath)) {
    fs.copyFileSync(oldPath, newPath);
  }

  // 4. 更新配置
  writeConfig({ dataDir: normalized });

  // 5. 拷贝成功后删除旧文件（仅在路径真的变化时）
  if (hasOldData && path.resolve(oldPath) !== path.resolve(newPath)) {
    try {
      fs.unlinkSync(oldPath);
    } catch {
      // 旧文件删除失败不阻塞流程（用户可手动清理）
    }
  }

  return { filePath: newPath };
}

// ============================================
// IPC 通道注册
// ============================================

export function registerStorageIpc(): void {
  /** 获取当前存储配置 */
  ipcMain.handle('storage:get-config', () => {
    const cfg = readConfig();
    return {
      filePath: path.join(cfg.dataDir, DB_FILENAME),
      defaultDir: getDefaultDataDir(),
    };
  });

  /** 从当前路径读取数据库二进制 */
  ipcMain.handle('storage:load', () => {
    return readDbFile();
  });

  /** 写入数据库二进制到当前路径 */
  ipcMain.handle('storage:save', (_event, data: Uint8Array) => {
    writeDbFile(data);
  });

  /** 弹出文件夹选择对话框 */
  ipcMain.handle('storage:choose-directory', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择数据存储位置',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  /** 切换存储目录并迁移数据 */
  ipcMain.handle('storage:set-path', (_event, newDir: string) => {
    return switchDataDir(newDir);
  });

  /** 在系统资源管理器中显示数据库文件 */
  ipcMain.handle('storage:open-in-folder', () => {
    const filePath = getCurrentDbPath();
    // 文件不存在时只打开所在目录
    if (fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
    } else {
      shell.openPath(path.dirname(filePath));
    }
  });

  /** 重置到默认存储位置（同时迁移数据） */
  ipcMain.handle('storage:reset-to-default', () => {
    const result = switchDataDir(getDefaultDataDir());
    return result;
  });
}
