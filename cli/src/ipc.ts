/**
 * @file CLI IPC 客户端
 * @description 通过 Unix socket（macOS/Linux）或 Windows 命名管道连接 GUI 主进程，
 *              用 JSON-RPC 调用渲染进程的 store action / database 查询。
 *
 * 协议与 electron/cli-server.ts 对齐：每条消息单行 JSON（\n 分隔）。
 *   请求：  { id, method, params }
 *   响应：  { id, result?, error? }
 *
 * 设计：
 * - 单连接贯穿一次 CLI 进程：connectOnce() 建立长连接，多次 ipcCall 复用。
 *   绝大多数 CLI 命令只调 1-3 次，但 list+resolve 这种场景复用连接更高效。
 * - 模式探测 detectMode()：尝试连接，成功 → 'ipc'；失败 → 'direct'（回退直连）。
 *   探测只做一次，结果缓存到 module 级变量。
 * - 所有调用带超时（默认 20s），避免 GUI 卡死时 CLI 永久挂起。
 */

import * as net from 'net';
import * as path from 'node:path';
import { APP_PACKAGE_NAME, APP_PRODUCT_NAME, getUserDataDir } from './storage';

// ============================================
// 端点路径解析（与 electron/cli-server.ts getCliEndpoint 一致）
// ============================================

/**
 * 返回本平台 GUI 监听的 socket/管道路径。
 * 必须与 electron/cli-server.ts 的 getCliEndpoint() 完全一致。
 *
 * - Windows: \\\\.\\pipe\\celery-todo
 * - macOS/Linux: <userData>/celery-todo.sock
 *
 * userData 探测复用 storage.ts（兼容打包版 "Celery Todo" 与开发版 "celery-todo"）。
 */
export function getCliEndpoint(): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\celery-todo`;
  }
  return path.join(getUserDataDir(), 'celery-todo.sock');
}

/** 供 getUserDataDir 复用的应用名（保持 storage.ts 单一来源，这里仅导出避免循环） */
export { APP_PACKAGE_NAME, APP_PRODUCT_NAME };

// ============================================
// 连接管理
// ============================================

let socket: net.Socket | null = null;
let connectPromise: Promise<net.Socket> | null = null;

/** 响应分派表：id → { resolve, reject } */
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let nextSeq = 0;

/** 接收缓冲：按 \n 切分消息 */
let recvBuffer = '';

/**
 * 建立到 GUI 的连接（带超时）。已连接则复用。
 * 连接建立后注册 data/error/close 处理。
 * @param timeoutMs 连接超时毫秒
 * @param customEndpoint 自定义端点路径（仅测试用；默认取 getCliEndpoint()）
 */
function connect(timeoutMs = 1500, customEndpoint?: string): Promise<net.Socket> {
  if (socket && !socket.destroyed) return Promise.resolve(socket);
  if (connectPromise) return connectPromise;

  const endpoint = customEndpoint ?? getCliEndpoint();
  connectPromise = new Promise<net.Socket>((resolve, reject) => {
    const s = net.createConnection(endpoint, () => {
      socket = s;
      resolve(s);
    });
    s.setEncoding('utf8');

    const timer = setTimeout(() => {
      s.destroy();
      connectPromise = null;
      reject(new Error(`连接 GUI 超时（${timeoutMs}ms）`));
    }, timeoutMs);

    s.on('error', (err) => {
      clearTimeout(timer);
      connectPromise = null;
      socket = null;
      reject(err);
    });

    s.on('connect', () => {
      clearTimeout(timer);
    });

    s.on('data', (chunk: string) => {
      recvBuffer += chunk;
      let nl: number;
      while ((nl = recvBuffer.indexOf('\n')) >= 0) {
        const line = recvBuffer.slice(0, nl).trim();
        recvBuffer = recvBuffer.slice(nl + 1);
        if (!line) continue;
        handleResponse(line);
      }
    });

    s.on('close', () => {
      // 连接断开：所有待决请求失败
      for (const [, p] of pending) p.reject(new Error('GUI 连接已断开'));
      pending.clear();
      socket = null;
      connectPromise = null;
      recvBuffer = '';
    });
  });
  return connectPromise;
}

/** 解析一行响应，分派到对应 pending */
function handleResponse(line: string): void {
  let msg: { id?: string; result?: unknown; error?: { message: string } };
  try {
    msg = JSON.parse(line);
  } catch {
    return; // 忽略无法解析的行
  }
  if (!msg.id) return;
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  if (msg.error) {
    p.reject(new Error(msg.error.message));
  } else {
    p.resolve(msg.result);
  }
}

// ============================================
// 模式探测
// ============================================

let cachedMode: 'ipc' | 'direct' | null = null;

/**
 * 探测 GUI 是否在运行（即 socket/管道可连）。
 * 结果缓存：一次 CLI 进程内只探测一次。
 * @returns 'ipc'（GUI 运行中，走 IPC）| 'direct'（GUI 未运行，回退直连）
 */
export async function detectMode(customEndpoint?: string): Promise<'ipc' | 'direct'> {
  if (cachedMode) return cachedMode;
  try {
    await connect(1000, customEndpoint);
    cachedMode = 'ipc';
  } catch {
    cachedMode = 'direct';
  }
  return cachedMode;
}

/** 重置缓存（仅测试用） */
export function resetModeCache(): void {
  cachedMode = null;
  if (socket && !socket.destroyed) socket.destroy();
  socket = null;
  connectPromise = null;
}

/** 返回上次探测结果（未探测则返回 null） */
export function getMode(): 'ipc' | 'direct' | null {
  return cachedMode;
}

// ============================================
// RPC 调用
// ============================================

/**
 * 发起一次 JSON-RPC 调用。
 * @param method 渲染进程 cli-bridge 支持的方法名
 * @param params 参数对象
 * @param timeoutMs 单次调用超时（默认 20s）
 */
export async function ipcCall<T = unknown>(
  method: string,
  params?: unknown,
  timeoutMs = 20000,
  customEndpoint?: string,
): Promise<T> {
  const s = await connect(1500, customEndpoint);
  nextSeq += 1;
  const id = `${Date.now()}-${nextSeq}`;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`调用 ${method} 超时（${timeoutMs}ms）`));
    }, timeoutMs);

    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v as T);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });

    const payload = JSON.stringify({ id, method, params }) + '\n';
    s.write(payload);
  });
}

/**
 * 关闭连接。在 CLI 退出前调用（withRuntime 的 finally 已覆盖）。
 * 幂等。
 */
export function closeIpc(): void {
  if (socket && !socket.destroyed) socket.destroy();
  socket = null;
  connectPromise = null;
  recvBuffer = '';
}
