/**
 * @file 渲染进程 CLI 桥接
 * @description 接收主进程转发的 CLI JSON-RPC 请求，在渲染进程上下文执行对应的
 *              Zustand store action 或 database.ts 查询，再把结果回传。
 *
 * 关键点：
 * - 所有数据写入经 store action（addTodo / updateTodo / ...）→ 走 store 的 set() →
 *   React 自动重渲染，GUI 实时刷新；同时 store 内部调用 database.ts 并触发
 *   scheduleSave（500ms 防抖）落盘。这是「CLI 改动实时反映到 GUI」的核心。
 * - 只读查询（list/show/stats）直接调 database.ts 同步函数，不经 store。
 * - 用 Zustand 的 getState() 在非组件代码中调用 action，无需经过 React 树。
 * - handler 任何异常都捕获并回 error，避免主进程的 Promise 永久挂起。
 */

import { useEffect } from 'react';
import * as db from './utils/database';
import { useTodoStore } from './store/useTodoStore';
import { useProjectStore } from './store/useProjectStore';
import type { Priority, Todo } from './types';

/** CLI 请求体（与 preload onCliRequest 一致） */
interface CliRequest {
  id: string;
  method: string;
  params?: unknown;
}

/**
 * 注册 CLI 请求监听。在 App 顶层挂载一次（useEffect），生命周期与窗口一致。
 * preload 的 onCliRequest 现已返回 unsubscribe，在 cleanup 里调用。
 */
export function useCliBridge(): void {
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onCliRequest) return;
    const off = api.onCliRequest((req) => {
      // 不 await：handler 内部自处理回包，避免阻塞 ipcRenderer 事件循环
      void handleRequest(req);
    });
    return () => {
      off();
    };
  }, []);
}

/** 处理单个 CLI 请求：执行业务，回包结果或错误 */
async function handleRequest(req: CliRequest): Promise<void> {
  const api = window.electronAPI;
  if (!api?.cliRespond) return;
  try {
    const result = await dispatch(req.method, req.params);
    await api.cliRespond({ id: req.id, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await api.cliRespond({ id: req.id, error: { message } });
  }
}

/**
 * 方法分派表。method 名与 CLI 端 ipcCall 约定一一对应。
 * 每个分支返回业务结果（同步或 Promise），由 handleRequest 统一回包。
 */
async function dispatch(method: string, params: unknown): Promise<unknown> {
  switch (method) {
    // ===== 只读查询（直接读 database.ts，不经 store）=====
    case 'getAllTodos':
      return db.getAllTodos();
    case 'getAllProjects':
      return db.getAllProjects();
    case 'getAllDeletedTodos':
      return db.getAllDeletedTodos();
    case 'getSetting': {
      const p = asRecord(params);
      return db.getSetting(asString(p.key));
    }

    // ===== Todo 写入（经 store，触发重渲染）=====
    case 'addTodo': {
      const p = asRecord(params);
      // 必须显式指定有效 projectId：addTodo 内部读 todo store 的 currentProjectId，
      // 若桌面应用未激活任何项目，currentProjectId 为空串，会写入 project_id='' 的孤儿 todo。
      // 此处前置拦截，避免再产生历史遗留那样的孤儿数据。
      if (typeof p.projectId !== 'string' || !p.projectId) {
        throw new Error('addTodo 需要 projectId：桌面应用当前未激活项目，请先指定 --project');
      }
      const priority: Priority =
        p.priority === 'high' || p.priority === 'medium' || p.priority === 'low'
          ? p.priority
          : 'medium';
      const todoParams = {
        title: asString(p.title),
        description: optionalString(p.description),
        priority,
      };
      // addTodo 读的是 todo store 的 currentProjectId（非 project store 的 activeProjectId）。
      // 故必须先 loadProject 让 todo store 切到目标项目，否则 addTodo 会用空/旧 projectId。
      useTodoStore.getState().loadProject(p.projectId);
      useProjectStore.getState().setActiveProject(p.projectId);
      useTodoStore.getState().addTodo(todoParams);
      return { ok: true };
    }
    case 'updateTodo': {
      const p = asRecord(params);
      const id = asString(p.id);
      const updates = (p.updates ?? {}) as Record<string, unknown>;
      useTodoStore.getState().updateTodo(id, normalizeTodoUpdates(updates));
      return { ok: true };
    }
    case 'toggleTodo': {
      const p = asRecord(params);
      useTodoStore.getState().toggleTodo(asString(p.id));
      return { ok: true };
    }
    case 'deleteTodo': {
      const p = asRecord(params);
      useTodoStore.getState().deleteTodo(asString(p.id));
      return { ok: true };
    }
    case 'restoreTodo': {
      const p = asRecord(params);
      useTodoStore.getState().restoreTodo(asString(p.id));
      return { ok: true };
    }
    case 'permanentlyDelete': {
      const p = asRecord(params);
      useTodoStore.getState().permanentlyDelete(asString(p.id));
      return { ok: true };
    }
    case 'emptyArchive': {
      // 仅清空当前项目归档（与 store 行为一致）
      useTodoStore.getState().emptyArchive();
      return { ok: true };
    }
    case 'emptyArchiveAll': {
      // 全局清空（跨项目），直接调 database
      db.emptyArchive();
      return { ok: true };
    }

    // ===== Project 写入（经 store）=====
    case 'createProject': {
      const p = asRecord(params);
      const id = useProjectStore
        .getState()
        .createProject(asString(p.name), optionalString(p.color));
      return { id };
    }
    case 'deleteProject': {
      const p = asRecord(params);
      useProjectStore.getState().deleteProject(asString(p.id));
      return { ok: true };
    }

    default:
      throw new Error(`未知的 CLI 方法: ${method}`);
  }
}

// ============================================
// 参数校验辅助（防御异常 CLI 入参）
// ============================================

function asRecord(params: unknown): Record<string, unknown> {
  return (params ?? {}) as Record<string, unknown>;
}

function asString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  throw new Error('参数类型错误：期望字符串');
}

function optionalString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') return v || undefined;
  throw new Error('参数类型错误：期望字符串');
}

/**
 * 把 CLI 传来的 updates 规范化为 store.updateTodo 接受的形状。
 * store 签名：Partial<Omit<Todo, 'id'|'projectId'|'createdAt'>>。
 */
function normalizeTodoUpdates(
  updates: Record<string, unknown>,
): Partial<Omit<Todo, 'id' | 'projectId' | 'createdAt'>> {
  const out: Record<string, unknown> = {};
  const allowed = ['title', 'description', 'completed', 'priority', 'completedAt'];
  for (const key of allowed) {
    if (key in updates) {
      const v = updates[key];
      if (key === 'completed') {
        out.completed = Boolean(v);
      } else if (key === 'priority') {
        out.priority = v === 'high' || v === 'medium' || v === 'low' ? v : 'medium';
      } else if (typeof v === 'string') {
        out[key] = v || undefined;
      } else {
        out[key] = v;
      }
    }
  }
  return out as Partial<Omit<Todo, 'id' | 'projectId' | 'createdAt'>>;
}
