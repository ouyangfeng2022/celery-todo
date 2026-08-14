/**
 * @file 3.0 桌面端骨架 UI
 * @description Tauri + @celery/data 数据链路的端到端验证界面：
 *              项目列表 / 分页加载 / 新增 / 完成 / 置顶 / 归档 / 计数 / 搜索。
 *              3.0 正式 UI（沿用 2.x 信息架构与主题）在后续里程碑迁移，
 *              本文件只证明"UI → Repository 契约 → Tauri 命令 → celery-db"全链可用。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProjectDto, TodoDto, TodoPage } from '@celery/data';
import { createTauriRepositories } from './lib/tauri-repositories';

const repos = createTauriRepositories();
const PAGE_SIZE = 20;

export default function App() {
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [page, setPage] = useState<TodoPage>({ items: [], nextCursor: null });
  const [term, setTerm] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newProject, setNewProject] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    try {
      setError(null);
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  const refreshProjects = useCallback(async () => {
    const list = await run(() => repos.projects.list());
    if (list) setProjects(list);
    return list;
  }, [run]);

  const refreshTodos = useCallback(
    async (projectId: string | null) => {
      if (!projectId) {
        setPage({ items: [], nextCursor: null });
        return;
      }
      const result = await run(() =>
        repos.todos.page({
          projectId,
          filter: 'all',
          priority: null,
          plannedFrom: null,
          plannedTo: null,
          sort: 'created-desc',
          limit: PAGE_SIZE,
          cursor: null,
        }),
      );
      if (result) setPage(result);
    },
    [run],
  );

  useEffect(() => {
    (async () => {
      await repos.projects.ensureInbox();
      const list = await refreshProjects();
      if (list && list.length > 0) setActiveId(list[0].id);
      setReady(true);
    })();
  }, [refreshProjects]);

  useEffect(() => {
    refreshTodos(activeId);
  }, [activeId, refreshTodos]);

  const counts = useMemo(() => {
    const total = page.items.length;
    const done = page.items.filter((t) => t.completed).length;
    return { total, done };
  }, [page]);

  const addTodo = async () => {
    const title = newTitle.trim();
    if (!title || !activeId) return;
    const created = await run(() =>
      repos.todos.create({
        id: crypto.randomUUID(),
        projectId: activeId,
        title,
        description: null,
        priority: 'medium',
        plannedDate: null,
        pinned: false,
        rank: Date.now(),
      }),
    );
    if (created) {
      setNewTitle('');
      await refreshTodos(activeId);
    }
  };

  const addProject = async () => {
    const name = newProject.trim();
    if (!name) return;
    const created = await run(() =>
      repos.projects.create({
        id: crypto.randomUUID(),
        name,
        kind: 'user',
        color: null,
      }),
    );
    if (created) {
      setNewProject('');
      await refreshProjects();
      setActiveId(created.id);
    }
  };

  const toggle = async (t: TodoDto) => {
    await run(() => repos.todos.update(t.id, { completed: !t.completed }));
    await refreshTodos(activeId);
  };

  const pin = async (t: TodoDto) => {
    await run(() => repos.todos.update(t.id, { pinned: !t.pinned }));
    await refreshTodos(activeId);
  };

  const archive = async (t: TodoDto) => {
    await run(() => repos.todos.archive([t.id]));
    await refreshTodos(activeId);
    await refreshProjects();
  };

  const loadMore = async () => {
    if (!activeId || !page.nextCursor) return;
    const next = await run(() =>
      repos.todos.page({
        projectId: activeId,
        filter: 'all',
        priority: null,
        plannedFrom: null,
        plannedTo: null,
        sort: 'created-desc',
        limit: PAGE_SIZE,
        cursor: page.nextCursor,
      }),
    );
    if (next) setPage((prev) => ({ items: [...prev.items, ...next.items], nextCursor: next.nextCursor }));
  };

  const doSearch = async () => {
    const t = term.trim();
    if (!t) {
      refreshTodos(activeId);
      return;
    }
    const result = await run(() =>
      repos.todos.search({ term: t, projectId: null, completed: null, limit: 50, cursor: null }),
    );
    if (result) setPage(result);
  };

  if (!ready) return <div className="boot">正在初始化 v3 数据库…</div>;

  return (
    <div className="shell">
      <aside className="sidebar">
        <h1>
          Celery Todo <span className="ver">3.0 · Tauri</span>
        </h1>
        <ul>
          {projects.map((p) => (
            <li
              key={p.id}
              className={p.id === activeId ? 'active' : ''}
              onClick={() => setActiveId(p.id)}
            >
              {p.kind === 'inbox' ? '📥' : '📁'} {p.name}
            </li>
          ))}
        </ul>
        <div className="row">
          <input
            value={newProject}
            placeholder="新项目名"
            onChange={(e) => setNewProject(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addProject()}
          />
        </div>
      </aside>

      <main className="main">
        <div className="toolbar">
          <input
            className="search"
            value={term}
            placeholder="搜索（FTS5）…"
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
          />
          <span className="counts">
            本页 {counts.total} · 已完成 {counts.done}
          </span>
        </div>

        <div className="row add">
          <input
            value={newTitle}
            placeholder="添加事项，回车确认"
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTodo()}
          />
        </div>

        {error && <div className="error">{error}</div>}

        <ul className="todos">
          {page.items.map((t) => (
            <li key={t.id} className={t.completed ? 'done' : ''}>
              <button className="check" onClick={() => toggle(t)} aria-label="完成切换">
                {t.completed ? '✓' : ''}
              </button>
              <span className="title">
                {t.pinned && <em className="pin">置顶</em>}
                {t.title}
              </span>
              <button className="ghost" onClick={() => pin(t)}>
                {t.pinned ? '取消置顶' : '置顶'}
              </button>
              <button className="ghost danger" onClick={() => archive(t)}>
                归档
              </button>
            </li>
          ))}
          {page.items.length === 0 && <li className="empty">暂无事项</li>}
        </ul>

        {page.nextCursor && (
          <button className="more" onClick={loadMore}>
            加载更多
          </button>
        )}
      </main>
    </div>
  );
}
