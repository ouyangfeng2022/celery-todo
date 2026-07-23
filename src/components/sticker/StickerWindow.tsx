import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as db from '../../utils/database';
import { useSettingsStore } from '../../store/useSettingsStore';
import type { Project, Todo } from '../../types';

interface Props {
  stickerId: string;
  initialProjectId: string;
}

export function StickerWindow({ stickerId, initialProjectId }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [ready, setReady] = useState(false);
  const project = useMemo(
    () => projects.find((item) => item.id === projectId),
    [projects, projectId],
  );
  // 贴图样式：从 useSettingsStore 取值。本窗口是独立 renderer，不与主窗口共享状态，
  // 故启动时 loadSettings()，并在收到主进程广播时再次 loadSettings()。
  const stickerPreset = useSettingsStore((s) => s.stickerPreset);
  const stickerRadius = useSettingsStore((s) => s.stickerRadius);
  const stickerBlur = useSettingsStore((s) => s.stickerBlur);
  const stickerOpacity = useSettingsStore((s) => s.stickerOpacity);
  const stickerShadow = useSettingsStore((s) => s.stickerShadow);

  const refresh = useCallback(() => {
    const ps = db.getAllProjects();
    setProjects(ps);
    const id = projectId || ps[0]?.id || '';
    if (id !== projectId) setProjectId(id);
    setTodos(id ? db.getTodosByProject(id).filter((todo) => !todo.completed) : []);
  }, [projectId]);
  useEffect(() => {
    void db.initDatabase().then(() => {
      // 同步读取本窗口应有的样式设置（首次加载 / 老数据缺失键时走默认）
      useSettingsStore.getState().loadSettings();
      refresh();
      setReady(true);
    });
  }, [refresh]);

  // 订阅主窗口发起的"贴图样式已变更"广播 —— 重新读 DB 同步本地状态。
  useEffect(() => {
    window.electronAPI?.onStickerStyleChanged?.(() => {
      useSettingsStore.getState().loadSettings();
    });
  }, []);

  // 订阅"其它窗口修改了数据库"广播（主窗口的增删改/完成操作）—— 重读内存库
  // 后刷新当前项目列表，让贴图与主窗口保持一致。本窗口自己 toggle 完成时不会
  // 收到此广播（主进程按 sender.id 过滤了发起者），故不会触发无谓 reload。
  useEffect(() => {
    window.electronAPI?.onDataChanged?.(async () => {
      await db.reloadDatabase();
      useSettingsStore.getState().loadSettings();
      refresh();
    });
  }, [refresh]);

  useEffect(() => {
    if (ready) {
      setTodos(projectId ? db.getTodosByProject(projectId).filter((todo) => !todo.completed) : []);
      void window.electronAPI?.setStickerProject(stickerId, projectId);
    }
  }, [projectId, ready, stickerId]);
  const toggle = async (todo: Todo) => {
    db.updateTodo({
      ...todo,
      completed: true,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await db.flushSave();
    refresh();
  };
  return (
    <div
      className={`sticker-shell${stickerShadow ? ' sticker-shadow-on' : ''}`}
      data-sticker-preset={stickerPreset}
      style={
        {
          '--sticker-radius': `${stickerRadius}px`,
          '--sticker-blur': `${stickerBlur}px`,
          '--sticker-opacity': `${stickerOpacity / 100}`,
        } as React.CSSProperties
      }
    >
      <header className="sticker-drag sticker-header">
        <select
          className="sticker-no-drag sticker-project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label="选择贴图项目"
        >
          {projects.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <button
          className="sticker-no-drag sticker-close"
          aria-label="关闭贴图"
          onClick={() => void window.electronAPI?.closeSticker(stickerId)}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </header>
      <div className="sticker-body">
        <p className="sticker-eyebrow">{project ? `${todos.length} 项待完成` : '选择一个项目'}</p>
        <AnimatePresence initial={false}>
          {todos.map((todo) => (
            <motion.button
              key={todo.id}
              layout
              exit={{ opacity: 0, x: 18 }}
              className="sticker-todo"
              onClick={() => void toggle(todo)}
              title="标记为完成"
            >
              <span className="sticker-check" /> <span>{todo.title}</span>
              {todo.pinned && <i>置顶</i>}
            </motion.button>
          ))}
        </AnimatePresence>
        {ready && todos.length === 0 && <div className="sticker-empty">这一页，已经轻盈完成。</div>}
      </div>
    </div>
  );
}
