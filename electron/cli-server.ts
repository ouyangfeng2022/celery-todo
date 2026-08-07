/**
 * @file CLI IPC 服务器（主进程侧）
 * @description 在主进程起一个 Unix domain socket（macOS/Linux）或 Windows 命名管道，
 *              接收 CLI 的 JSON-RPC 请求并直接调用主进程数据库仓储。
 *
 * 数据流：
 *   CLI ──net──► 本 server ──► database-repository ──► SQLite
 *
 * 协议：每条消息单行 JSON（\n 分隔）。
 *   请求：  { id: string, method: string, params?: unknown }
 *   响应：  { id: string, result?: unknown, error?: { message: string } }
 *
 * GUI 运行时与 renderer 使用同一个仓储连接；GUI 未运行时 CLI 保留直连 SQLite 回退。
 */

import { app, BrowserWindow } from 'electron';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { commandData, queryData } from './database-repository';

// ============================================
// 常量
// ============================================

/** Windows 命名管道名（位于 \\.\pipe\ 命名空间） */
const PIPE_NAME = 'celery-todo';
/** macOS/Linux socket 文件名（位于 userData 下） */
const SOCK_FILENAME = 'celery-todo.sock';
/** 请求/响应单条消息最大字节，防御异常客户端 */
const MAX_MESSAGE_BYTES = 8 * 1024 * 1024; // 8 MiB

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

/**
 * 把一个 CLI 请求路由到主进程仓储，返回 Promise（结果或错误）。
 * 窗口未就绪/已销毁时立即 reject。
 */
function dispatchToRenderer(method: string, params: unknown): Promise<unknown> {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) {
    return Promise.reject(new Error('GUI 窗口未就绪，请确认桌面应用已完全启动'));
  }
  return Promise.resolve(dispatchToRepository(method, params));
}

type Row = Record<string, unknown>;

function todo(row: Row): Row {
  return {
    id: String(row.id), projectId: String(row.project_id), title: String(row.title),
    description: (row.description as string | null) ?? undefined, completed: Number(row.completed) === 1,
    priority: row.priority, createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    completedAt: (row.completed_at as string | null) ?? undefined, order: Number(row.sort_order),
    pinned: Number(row.pinned) === 1,
  };
}

function project(row: Row): Row {
  return { id: String(row.id), name: String(row.name), color: (row.color as string | null) ?? undefined, createdAt: String(row.created_at), updatedAt: String(row.updated_at), order: Number(row.sort_order) };
}

/** GUI 在线时直接访问主进程仓储，避免 renderer 参与读写与同步。 */
function dispatchToRepository(method: string, params: unknown): unknown {
  const input = (params ?? {}) as Row;
  const todos = (): Row[] => (queryData('allTodos') as Row[]).map(todo);
  const deleted = (): Row[] => (queryData('allDeleted') as Row[]).map((row) => ({ ...todo(row), deletedAt: String(row.deleted_at), expiresAt: String(row.expires_at) }));
  switch (method) {
    case 'getAllTodos': return todos();
    case 'getAllProjects': return (queryData('projects') as Row[]).map(project);
    case 'getAllDeletedTodos': return deleted();
    case 'getSetting': return queryData('setting', { key: String(input.key) }) ?? null;
    case 'addTodo': {
      const projectId = String(input.projectId ?? '');
      if (!projectId) throw new Error('addTodo 需要 projectId');
      const existing = (queryData('todosByProject', { projectId }) as Row[]);
      const now = new Date().toISOString();
      const created = { id: crypto.randomUUID(), projectId, title: String(input.title).trim(), description: input.description || undefined, completed: false, priority: input.priority ?? 'medium', createdAt: now, updatedAt: now, order: Math.max(0, ...existing.map((item) => Number(item.sort_order))) + 1024, pinned: false };
      commandData('insertTodo', { todo: created });
      return { id: created.id };
    }
    case 'updateTodo': {
      const current = todos().find((item) => item.id === String(input.id));
      if (!current) throw new Error(`未找到待办 ${String(input.id)}`);
      commandData('updateTodo', { todo: { ...current, ...(input.updates as Row), updatedAt: new Date().toISOString() } });
      return { ok: true };
    }
    case 'toggleTodo': {
      const current = todos().find((item) => item.id === String(input.id));
      if (!current) throw new Error(`未找到待办 ${String(input.id)}`);
      const completed = !current.completed;
      commandData('updateTodo', { todo: { ...current, completed, completedAt: completed ? new Date().toISOString() : undefined, updatedAt: new Date().toISOString() } });
      return { ok: true };
    }
    case 'deleteTodo': {
      const current = todos().find((item) => item.id === String(input.id));
      if (!current) throw new Error(`未找到待办 ${String(input.id)}`);
      const now = new Date().toISOString();
      commandData('archiveTodos', { todos: [{ ...current, deletedAt: now, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() }] });
      return { ok: true };
    }
    case 'restoreTodo': commandData('restoreTodo', { id: String(input.id) }); return { ok: true };
    case 'permanentlyDelete': commandData('permanentlyDelete', { id: String(input.id) }); return { ok: true };
    case 'emptyArchive': commandData('emptyArchive', { projectId: input.projectId }); return { ok: true };
    case 'emptyArchiveAll': commandData('emptyArchive'); return { ok: true };
    case 'createProject': {
      const now = new Date().toISOString();
      const created = { id: crypto.randomUUID(), name: String(input.name).trim(), color: input.color || undefined, createdAt: now, updatedAt: now };
      commandData('insertProject', { project: created });
      return { id: created.id };
    }
    case 'deleteProject': commandData('deleteProject', { id: String(input.id) }); return { ok: true };
    default: throw new Error(`未知的 CLI 方法: ${method}`);
  }
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
 * 停止服务器并清理 socket 文件。在 before-quit 时调用。
 */
export function shutdownCliServer(): void {
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
