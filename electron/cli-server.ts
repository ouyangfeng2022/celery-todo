/**
 * @file CLI IPC 服务器（主进程侧）
 * @description 在主进程起一个 Unix domain socket（macOS/Linux）或 Windows 命名管道，
 *              接收 CLI 的 JSON-RPC 请求，转发给渲染进程执行，再把结果回传给 CLI。
 *
 * 数据流：
 *   CLI ──net──► 本 server ──webContents.send('cli:request')──► 渲染进程
 *     渲染进程执行 store action / database 查询
 *     渲染进程 ──ipcRenderer.invoke('cli:response')──► 本 server ──net──► CLI
 *
 * 协议：每条消息单行 JSON（\n 分隔）。
 *   请求：  { id: string, method: string, params?: unknown }
 *   响应：  { id: string, result?: unknown, error?: { message: string } }
 *
 * 主进程自身不解读 method/params —— 它只做透传与 ID 配对，真正的业务逻辑
 * 全部在渲染进程的 src/cli-bridge.ts 里。这样主进程保持薄层，store/database
 * 的访问权集中在渲染进程，与现有架构一致。
 */

import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// 常量
// ============================================

/** Windows 命名管道名（位于 \\.\pipe\ 命名空间） */
const PIPE_NAME = 'celery-todo';
/** macOS/Linux socket 文件名（位于 userData 下） */
const SOCK_FILENAME = 'celery-todo.sock';
/** 请求/响应单条消息最大字节，防御异常客户端 */
const MAX_MESSAGE_BYTES = 8 * 1024 * 1024; // 8 MiB
/** 渲染进程响应超时：CLI 请求发出后等待回包的最长时间 */
const RENDERER_TIMEOUT_MS = 15000;

// ============================================
// 主窗口引用（注入）
// ============================================

let mainWindowRef: BrowserWindow | null = null;

// ============================================
// socket 路径解析
// ============================================

/**
 * 返回本平台 CLI 通信端点路径。
 * - Windows：命名管道 \\\\.\\pipe\\celery-todo
 * - macOS/Linux：userData/celery-todo.sock
 */
export function getCliEndpoint(): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\${PIPE_NAME}`;
  }
  return path.join(app.getPath('userData'), SOCK_FILENAME);
}

// ============================================
// 渲染进程请求/响应配对
// ============================================

/** 待决请求：主进程发出 cli:request 后，等待渲染进程 cli:response 回包 */
interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/** id → 待决请求。响应到达或超时后删除 */
const pending = new Map<string, PendingRequest>();

let nextSeq = 0;
function nextId(): string {
  // 进程内自增 + 时间戳，确保单次运行内唯一
  nextSeq += 1;
  return `${Date.now()}-${nextSeq}`;
}

/**
 * 把一个 CLI 请求转发给渲染进程执行，返回 Promise（结果或错误）。
 * 窗口未就绪/已销毁时立即 reject。
 */
function dispatchToRenderer(method: string, params: unknown): Promise<unknown> {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) {
    return Promise.reject(new Error('GUI 窗口未就绪，请确认桌面应用已完全启动'));
  }
  const id = nextId();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`渲染进程响应超时（${RENDERER_TIMEOUT_MS}ms）`));
    }, RENDERER_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    mainWindowRef!.webContents.send('cli:request', { id, method, params });
  });
}

// ============================================
// net 服务器：接收 CLI 连接，解析 JSON-RPC
// ============================================

let server: net.Server | null = null;

/**
 * 处理单个客户端连接：按行切分消息，逐条解析并 dispatch。
 * 每个请求独立 await，互不阻塞。
 */
function handleClient(socket: net.Socket): void {
  let buffer = '';
  socket.setEncoding('utf8');
  socket.on('data', async (chunk: string) => {
    buffer += chunk;
    // 防御：单连接缓冲区上限，避免恶意/异常客户端耗尽内存
    if (buffer.length > MAX_MESSAGE_BYTES) {
      sendError(socket, 'unknown', '请求体过大');
      socket.destroy();
      return;
    }
    // 按行处理：一条消息一个完整 JSON
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      await handleLine(socket, line);
    }
  });
  socket.on('error', () => {
    // 客户端异常断开：静默，避免未捕获 error 事件导致主进程崩溃
  });
}

/** 处理一行 JSON-RPC 请求 */
async function handleLine(socket: net.Socket, line: string): Promise<void> {
  let msg: { id?: string; method?: string; params?: unknown };
  try {
    msg = JSON.parse(line);
  } catch {
    sendError(socket, 'unknown', 'JSON 解析失败');
    return;
  }
  const id = msg.id ?? 'unknown';
  const method = msg.method;
  if (!method) {
    sendError(socket, id, '缺少 method 字段');
    return;
  }
  try {
    const result = await dispatchToRenderer(method, msg.params);
    send(socket, { id, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send(socket, { id, error: { message } });
  }
}

/** 发送一条 JSON 响应给客户端 */
function send(socket: net.Socket, payload: unknown): void {
  if (socket.destroyed) return;
  socket.write(JSON.stringify(payload) + '\n');
}

/** 发送错误响应（id 未知时用占位） */
function sendError(socket: net.Socket, id: string, message: string): void {
  send(socket, { id, error: { message } });
}

// ============================================
// 生命周期：启动 / 停止
// ============================================

/**
 * 启动 CLI IPC 服务器。在 app.whenReady、主窗口创建后调用一次。
 * 失败（端口/管道占用且非本应用残留）时记录错误但不阻塞应用启动。
 */
export function initCliServer(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow;
  registerResponseHandler();

  const endpoint = getCliEndpoint();
  server = net.createServer(handleClient);

  // macOS/Linux：监听前清理可能残留的旧 socket 文件（上次崩溃未清理）
  if (process.platform !== 'win32') {
    try {
      fs.unlinkSync(endpoint);
    } catch {
      // 文件不存在忽略
    }
  }

  server.on('error', (err: NodeJS.ErrnoException) => {
    // Windows: 管道已被占用（EADDRINUSE）通常是另一个实例；非 Windows 同理
    console.error(`[cli-server] 监听 ${endpoint} 失败:`, err.message);
  });

  server.listen(endpoint, () => {
    console.log(`[cli-server] 监听于 ${endpoint}`);
  });
}

/**
 * 注册渲染进程回包的 ipcMain.handle。
 * 幂等：多次调用只注册一次。
 */
let responseRegistered = false;
function registerResponseHandler(): void {
  if (responseRegistered) return;
  responseRegistered = true;
  ipcMain.handle('cli:response', (_event: IpcMainInvokeEvent, payload: { id: string; result?: unknown; error?: { message: string } }) => {
    const req = pending.get(payload.id);
    if (!req) return; // 已超时或未知 id，忽略
    clearTimeout(req.timer);
    pending.delete(payload.id);
    if (payload.error) {
      req.reject(new Error(payload.error.message));
    } else {
      req.resolve(payload.result);
    }
  });
}

/**
 * 停止服务器并清理 socket 文件。在 before-quit 时调用。
 */
export function shutdownCliServer(): void {
  // 让所有待决请求失败，避免 CLI 侧无限等待
  for (const [, req] of pending) {
    clearTimeout(req.timer);
    req.reject(new Error('应用正在退出'));
  }
  pending.clear();

  if (server) {
    server.close();
    server = null;
  }
  // 非 Windows：删除 socket 文件，避免下次启动残留
  if (process.platform !== 'win32') {
    try {
      fs.unlinkSync(getCliEndpoint());
    } catch {
      // 忽略
    }
  }
}
