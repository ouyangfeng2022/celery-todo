/**
 * @file 安装时选项应用模块
 * @description NSIS 安装器在用户勾选「使用自定义设置」时，会把选择写入
 *              userData/install-options.json。主进程在 app.whenReady 早期读取
 *              并应用（写入 storage-config.json、设置开机自启），随后删除该文件，
 *              保证只生效一次。自动升级（带 --updated 参数）场景下 NSIS 会跳过
 *              自定义页，不会产生 install-options.json，这里也就什么都不做。
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { applyInitialDataDir } from './storage';

// ============================================
// 常量与类型
// ============================================

/** 安装器写入的选项文件名（始终位于 userData 根目录） */
const INSTALL_OPTIONS_FILENAME = 'install-options.json';

/** install-options.json 的 schema 版本，便于未来扩展时识别老格式 */
const INSTALL_OPTIONS_VERSION = 1;

/** 安装器写入的选项结构 */
export interface InstallOptions {
  version: number;
  /** 是否开机自启动 */
  autoStart: boolean;
  /** 是否创建桌面快捷方式（NSIS 直接处理，主进程只记录） */
  createDesktopShortcut: boolean;
  /** 是否创建开始菜单快捷方式（NSIS 直接处理，主进程只记录） */
  createStartMenuShortcut: boolean;
  /** 自定义数据目录，空串表示用默认位置 */
  dataDir: string;
}

// ============================================
// 模块级状态：开机自启"待同步给 renderer"标志
// ============================================

/**
 * 主进程在 whenReady 早期通过 app.setLoginItemSettings 写注册表后，
 * 还需要让 renderer 把 settings.autoStart 写进 DB（保持 UI 与系统状态一致）。
 * 用模块级 flag 暂存，等 BrowserWindow 加载完成后通过 IPC 推送一次。
 */
let pendingAutoStartSync = false;

// ============================================
// 文件读写
// ============================================

/** install-options.json 的完整路径 */
function getInstallOptionsPath(): string {
  return path.join(app.getPath('userData'), INSTALL_OPTIONS_FILENAME);
}

/**
 * 解析单条选项，未知/缺字段走默认值。所有字段都做类型兜底，
 * 即便 NSIS 写入了意外内容（或用户手改过）也不致抛错。
 *
 * 兼容三种来源：
 *   - 真 boolean（未来其它写法或手改）
 *   - 字符串 "true"/"false"（标准 JSON）
 *   - 数字 1/0（NSIS installer.nsh 当前的实际产物 —— NSIS 变量是字符串，
 *     FileWrite 展开后写入的是裸 1/0，JSON.parse 解析为数字）
 *
 * 导出供单元测试使用（src/test/install-options.spec.ts） */
export function normalizeInstallOptions(raw: unknown): InstallOptions {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const asBool = (v: unknown, fallback: boolean): boolean => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return v === 'true' || v === '1';
    return fallback;
  };
  const asStr = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  return {
    version: typeof obj.version === 'number' ? obj.version : INSTALL_OPTIONS_VERSION,
    autoStart: asBool(obj.autoStart, false),
    createDesktopShortcut: asBool(obj.createDesktopShortcut, true),
    createStartMenuShortcut: asBool(obj.createStartMenuShortcut, true),
    dataDir: asStr(obj.dataDir),
  };
}

/** 读取并解析 install-options.json；文件不存在或损坏时返回 null */
export function readInstallOptions(): InstallOptions | null {
  try {
    const filePath = getInstallOptionsPath();
    if (!fs.existsSync(filePath)) return null;
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return normalizeInstallOptions(raw);
  } catch {
    // 文件损坏（手改 / 写入中断）时，当作无选项处理
    return null;
  }
}

/** 删除 install-options.json，保证只生效一次；不存在时静默 */
function deleteInstallOptions(): void {
  try {
    const filePath = getInstallOptionsPath();
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // 删除失败不阻塞启动，下次启动会重复应用一次（幂等）
  }
}

// ============================================
// 应用入口
// ============================================

/**
 * 在 app.whenReady 早期调用：读取并应用 NSIS 写入的安装选项，然后删除文件。
 * 任何异常都不抛出，最坏情况是退回默认行为启动。
 *
 * 返回值用于诊断（不强制消费）：
 *   - null：没有安装选项（首次启动 / 老版本升级 / 自动升级）
 *   - InstallOptions：成功读取并尝试应用
 */
export function applyInstallOptionsOnce(): InstallOptions | null {
  const options = readInstallOptions();
  if (!options) return null;

  // 1. 自定义数据目录：仅在用户选了非空目录时才写入 storage-config.json，
  //    保留「文件存在 = 用户自定义过」的原有语义（写空串会破坏 readConfig 的校验）
  if (options.dataDir) {
    try {
      applyInitialDataDir(options.dataDir);
    } catch {
      // 目标目录不可写或已存在 db 文件等：保持默认目录，不阻塞启动
    }
  }

  // 2. 开机自启：直接调 Electron API 写注册表
  if (options.autoStart) {
    try {
      app.setLoginItemSettings({ openAtLogin: true });
      // 标记待同步：等 renderer 加载完成后通过 IPC 推送，让它把 settings.autoStart 写进 DB
      pendingAutoStartSync = true;
    } catch {
      // 写注册表失败不阻塞启动
    }
  }

  // 3. 桌面 / 开始菜单快捷方式由 NSIS 直接处理，主进程不参与

  // 4. 应用完成，删除一次性文件
  deleteInstallOptions();

  return options;
}

/**
 * 取走"待同步给 renderer 的开机自启"标志。
 * 主进程在 BrowserWindow.did-finish-load 后调用一次，并把结果推送给 renderer。
 * 取走后自动清零，避免重复同步。
 */
export function consumePendingAutoStartSync(): boolean {
  const v = pendingAutoStartSync;
  pendingAutoStartSync = false;
  return v;
}
