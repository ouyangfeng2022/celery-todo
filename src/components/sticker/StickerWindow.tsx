import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as db from '../../utils/database';
import { readProjectSort, sortTodos } from '../../utils/sortTodos';
import { useSettingsStore } from '../../store/useSettingsStore';
import { PRIORITY_LABELS, PRIORITY_SOLID, type Project, type Todo } from '../../types';

interface Props {
  stickerId: string;
  initialProjectId: string;
}

/** 浅比较项目列表（id + name + color），内容相同则视为无需更新，避免 select 抖动 */
function sameProjects(a: Project[], b: Project[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (!x || !y) return false;
    if (x.id !== y.id || x.name !== y.name || x.color !== y.color) return false;
  }
  return true;
}

/**
 * 取某项目未完成 todo，并按主窗口该项目持久化的排序方式排序。
 * 排序逻辑与主窗口 useFilter 共用 sortTodos，确保两端顺序完全一致。
 */
function loadActiveTodos(pid: string): Todo[] {
  if (!pid) return [];
  const raw = db.getTodosByProject(pid).filter((todo) => !todo.completed);
  return sortTodos(raw, readProjectSort(pid));
}

export function StickerWindow({ stickerId, initialProjectId }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [ready, setReady] = useState(false);
  // 用 ref 持有最新 projectId，让 refresh 引用保持稳定（不依赖 projectId），
  // 从而订阅 effect 不会因切项目而反复重订阅、泄漏监听器。
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
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

  // 仅按"当前 projectId 重读项目列表 + 该项目的未完成 todo"。
  // 不再回写 setProjectId —— 回写会与 select 受控值互相打架，导致项目反复横跳。
  // 首次进入且 projectId 为空时，回落到第一个项目（仅在此一处补默认值）。
  const refresh = useCallback(() => {
    const ps = db.getAllProjects();
    setProjects((prev) => (sameProjects(prev, ps) ? prev : ps));
    const id = projectIdRef.current || ps[0]?.id || '';
    setTodos(loadActiveTodos(id));
  }, []);
  useEffect(() => {
    void db.initDatabase().then(() => {
      // 同步读取本窗口应有的样式设置（首次加载 / 老数据缺失键时走默认）
      useSettingsStore.getState().loadSettings();
      // 首次加载时若 initialProjectId 缺失，回落到第一个项目并持久化，让 select 有值。
      const ps = db.getAllProjects();
      if (!projectIdRef.current && ps[0]) {
        setProjectId(ps[0].id);
        projectIdRef.current = ps[0].id;
        void window.electronAPI?.setStickerProject(stickerId, ps[0].id);
      }
      refresh();
      setReady(true);
    });
  }, [refresh, stickerId]);

  // 订阅主窗口发起的"贴图样式已变更"广播 —— 重新读 DB 同步本地状态。
  useEffect(() => {
    const off = window.electronAPI?.onStickerStyleChanged?.(() => {
      useSettingsStore.getState().loadSettings();
    });
    return () => {
      off?.();
    };
  }, []);

  // 订阅"其它窗口修改了数据库"广播（主窗口的增删改/完成操作）—— 重读内存库
  // 后刷新当前项目列表，让贴图与主窗口保持一致。本窗口自己 toggle 完成时不会
  // 收到此广播（主进程按 sender.id 过滤了发起者），故不会触发无谓 reload。
  useEffect(() => {
    const off = window.electronAPI?.onDataChanged?.(async () => {
      await db.reloadDatabase();
      useSettingsStore.getState().loadSettings();
      refresh();
    });
    return () => {
      off?.();
    };
  }, [refresh]);

  useEffect(() => {
    if (ready) {
      setTodos(loadActiveTodos(projectId));
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
              style={
                {
                  '--sticker-priority-color': PRIORITY_SOLID[todo.priority],
                } as React.CSSProperties
              }
            >
              <span className="sticker-priority-bar" aria-hidden="true" />
              <span className="sticker-check" />
              <span className="sticker-todo-title">{todo.title}</span>
              <span
                className="sticker-priority-tag"
                data-priority={todo.priority}
                aria-label={`优先级：${PRIORITY_LABELS[todo.priority]}`}
              >
                {PRIORITY_LABELS[todo.priority]}
              </span>
              {todo.pinned && <i>置顶</i>}
            </motion.button>
          ))}
        </AnimatePresence>
        {ready && todos.length === 0 && <div className="sticker-empty">这一页，已经轻盈完成。</div>}
      </div>
    </div>
  );
}
