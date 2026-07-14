/**
 * @file IPC 通信层测试
 * @description 启动临时 net server（监听命名管道/Unix socket），模拟主进程的
 *              cli-server.ts 行为，验证 JSON-RPC 请求/响应的完整往返。
 *
 * 测试策略：
 * - 启动临时 net server 模拟 GUI 主进程
 * - 使用 Node.js 原生 net 连接测试 server 发送和接收 JSON-RPC 消息
 * - 验证 JSON-RPC over net 协议的格式正确性（id 配对、error 回传、并发等）
 * - ipc.ts 集成已在端到端烟测中验证（add/list/done/edit 全部通过）
 *
 * 注意：ipc.ts 是模块级单例（socket、pending map、cachedMode 共享），
 * 不适合在 vitest 中做多测试隔离。集成测试通过 smoke test 覆盖。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

// ============================================
// 测试用 JSON-RPC net server
// ============================================

function tempPipePath(): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\celery-test-${Date.now()}`;
  }
  return path.join(os.tmpdir(), `celery-test-${Date.now()}.sock`);
}

interface TestRequest {
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * 测试用 JSON-RPC server。
 * 每个请求格式：单行 JSON {id, method, params}，响应格式：单行 JSON {id, result?, error?}。
 * handler 可以返回值或 Promise。同步 throw 也正常转化为 error 响应。
 */
function createTestServer() {
  let server: net.Server | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let requestHandler: (req: TestRequest) => any = (req) => {
    if (req.method === 'echo') return req.params;
    if (req.method === 'error-method') throw new Error('模拟错误');
    return null;
  };

  const start = (endpoint: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      server = net.createServer((socket) => {
        let buffer = '';

        function handleLine(line: string): void {
          if (!line.trim()) return;
          let req: TestRequest;
          try {
            req = JSON.parse(line);
          } catch {
            if (!socket.destroyed) {
              socket.write(JSON.stringify({ id: '', error: { message: 'JSON 解析错误' } }) + '\n');
            }
            return;
          }

          try {
            const result = requestHandler(req);
            // 处理同步返回值或 Promise
            Promise.resolve(result)
              .then((value: unknown) => {
                if (!socket.destroyed) {
                  socket.write(JSON.stringify({ id: req.id, result: value }) + '\n');
                }
              })
              .catch((err: Error) => {
                const message = err instanceof Error ? err.message : String(err);
                if (!socket.destroyed) {
                  socket.write(JSON.stringify({ id: req.id, error: { message } }) + '\n');
                }
              });
          } catch (err) {
            // 处理 handler 同步 throw
            const message = err instanceof Error ? err.message : String(err);
            if (!socket.destroyed) {
              socket.write(JSON.stringify({ id: req.id, error: { message } }) + '\n');
            }
          }
        }

        socket.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            handleLine(line);
          }
        });
      });

      server.on('error', reject);

      if (process.platform === 'win32') {
        server.listen(endpoint, () => resolve());
      } else {
        try {
          fs.unlinkSync(endpoint);
        } catch {
          /* ignore */
        }
        server.listen(endpoint, () => resolve());
      }
    });
  };

  const close = (endpoint: string): Promise<void> => {
    return new Promise((resolve) => {
      if (server) {
        server.close(() => {
          if (process.platform !== 'win32') {
            try {
              fs.unlinkSync(endpoint);
            } catch {
              /* ignore */
            }
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  };

  return {
    start,
    close,
    setHandler: (fn: typeof requestHandler) => {
      requestHandler = fn;
    },
  };
}

// ============================================
// 辅助：通过原生 net 连接发送 JSON-RPC 请求
// ============================================

function sendRawRequest(
  endpoint: string,
  payload: object,
  timeoutMs = 2000,
): Promise<{ id?: string; result?: unknown; error?: { message: string } }> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint, () => {
      socket.write(JSON.stringify(payload) + '\n');
    });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('响应超时'));
    }, timeoutMs);
    let buf = '';
    socket.on('data', (chunk) => {
      buf += chunk.toString();
      const nl = buf.indexOf('\n');
      if (nl >= 0) {
        clearTimeout(timer);
        const line = buf.slice(0, nl).trim();
        socket.destroy();
        try {
          resolve(JSON.parse(line));
        } catch {
          reject(new Error('响应 JSON 解析失败'));
        }
      }
    });
    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ============================================
// 测试主体
// ============================================

describe('JSON-RPC over net 协议', () => {
  let endpoint: string;
  const server = createTestServer();

  beforeAll(async () => {
    endpoint = tempPipePath();
    await server.start(endpoint);
  });

  afterAll(async () => {
    await server.close(endpoint);
  });

  it('echo 请求收到正确响应', async () => {
    const resp = await sendRawRequest(endpoint, {
      id: '1',
      method: 'echo',
      params: { hello: 'world' },
    });
    expect(resp).toMatchObject({ id: '1', result: { hello: 'world' } });
  });

  it('服务端返回 error 字段', async () => {
    const resp = await sendRawRequest(endpoint, { id: '2', method: 'error-method' });
    expect(resp).toMatchObject({ id: '2', error: { message: '模拟错误' } });
  });

  it('请求与响应的 id 保持一致', async () => {
    const resp = await sendRawRequest(endpoint, {
      id: 'my-custom-id-99',
      method: 'echo',
      params: { x: 1 },
    });
    expect(resp.id).toBe('my-custom-id-99');
  });

  it('params 为空时响应正确', async () => {
    const resp = await sendRawRequest(endpoint, { id: '4', method: 'echo' });
    expect(resp.id).toBe('4');
    // result 为 undefined 时 JSON.stringify 会丢弃该字段
  });

  it('未知方法返回 null result', async () => {
    const resp = await sendRawRequest(endpoint, { id: '5', method: 'nonexistent' });
    expect(resp).toMatchObject({ id: '5', result: null });
  });

  it('并发请求各自拿到正确响应（多连接）', async () => {
    server.setHandler((req) => {
      return { echoed: true, method: req.method, value: req.params?.val };
    });

    const results = await Promise.all([
      sendRawRequest(endpoint, { id: 'a', method: 'echo', params: { val: 1 } }),
      sendRawRequest(endpoint, { id: 'b', method: 'echo', params: { val: 2 } }),
      sendRawRequest(endpoint, { id: 'c', method: 'echo', params: { val: 3 } }),
    ]);

    expect(results.find((r) => r.id === 'a')).toMatchObject({ result: { value: 1 } });
    expect(results.find((r) => r.id === 'b')).toMatchObject({ result: { value: 2 } });
    expect(results.find((r) => r.id === 'c')).toMatchObject({ result: { value: 3 } });
  });

  it('handler 返回 Promise 也能正确处理', async () => {
    server.setHandler((req) => {
      return Promise.resolve({ async: true, method: req.method });
    });

    const resp = await sendRawRequest(endpoint, { id: 'p1', method: 'promiseMethod' });
    expect(resp).toMatchObject({ id: 'p1', result: { async: true, method: 'promiseMethod' } });
  });

  it('handler 异步 reject 返回 error', async () => {
    server.setHandler((_req) => {
      return Promise.reject(new Error('异步错误'));
    });

    const resp = await sendRawRequest(endpoint, { id: 'p2', method: 'badPromise' });
    expect(resp).toMatchObject({ id: 'p2', error: { message: '异步错误' } });
  });
});
