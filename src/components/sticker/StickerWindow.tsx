import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as db from '../../utils/database';
import type { Project, Todo } from '../../types';

interface Props { stickerId: string; initialProjectId: string }

export function StickerWindow({ stickerId, initialProjectId }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [ready, setReady] = useState(false);
  const project = useMemo(() => projects.find((item) => item.id === projectId), [projects, projectId]);
  const refresh = useCallback(() => { const ps = db.getAllProjects(); setProjects(ps); const id = projectId || ps[0]?.id || ''; if (id !== projectId) setProjectId(id); setTodos(id ? db.getTodosByProject(id).filter((todo) => !todo.completed) : []); }, [projectId]);
  useEffect(() => { void db.initDatabase().then(() => { refresh(); setReady(true); }); }, [refresh]);
  useEffect(() => { if (ready) { setTodos(projectId ? db.getTodosByProject(projectId).filter((todo) => !todo.completed) : []); void window.electronAPI?.setStickerProject(stickerId, projectId); } }, [projectId, ready, stickerId]);
  const toggle = async (todo: Todo) => { db.updateTodo({ ...todo, completed: true, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); await db.flushSave(); refresh(); };
  return <div className="sticker-shell">
    <header className="sticker-drag sticker-header">
      <select className="sticker-no-drag sticker-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="选择贴图项目">
        {projects.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
      </select>
      <button className="sticker-no-drag sticker-close" aria-label="关闭贴图" onClick={() => void window.electronAPI?.closeSticker(stickerId)}>×</button>
    </header>
    <div className="sticker-body">
      <p className="sticker-eyebrow">{project ? `${todos.length} 项待完成` : '选择一个项目'}</p>
      <AnimatePresence initial={false}>
        {todos.map((todo) => <motion.button key={todo.id} layout exit={{ opacity: 0, x: 18 }} className="sticker-todo" onClick={() => void toggle(todo)} title="标记为完成">
          <span className="sticker-check" /> <span>{todo.title}</span>{todo.pinned && <i>置顶</i>}
        </motion.button>)}
      </AnimatePresence>
      {ready && todos.length === 0 && <div className="sticker-empty">这一页，已经轻盈完成。</div>}
    </div>
  </div>;
}
