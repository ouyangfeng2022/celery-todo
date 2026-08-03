import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as db from '../../utils/database';
import { readProjectSort, sortTodos } from '../../utils/sortTodos';
import { useSettingsStore } from '../../store/useSettingsStore';
import { PRIORITY_LABELS, PRIORITY_SOLID, type Project, type Todo } from '../../types';
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu';

interface Props {
  stickerId: string;
  initialProjectId: string;
}

interface StickerTodoListProps {
  todos: Todo[];
  ready: boolean;
  onToggle: (todo: Todo) => void;
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

/**
 * 每次切换项目时通过 key 整体重建列表，避免两个项目的行进入同一个
 * AnimatePresence/layout 动画树；同一项目内完成事项时仍保留退场与重排动画。
 */
function StickerTodoList({ todos, ready, onToggle }: StickerTodoListProps) {
  return (
    <>
      <AnimatePresence initial={false}>
        {todos.map((todo) => (
          <motion.button
            key={todo.id}
            layout
            exit={{ opacity: 0, x: 18 }}
            className="sticker-todo"
            onClick={() => onToggle(todo)}
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
    </>
  );
}

export function StickerWindow({ stickerId, initialProjectId }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [ready, setReady] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const projectPickerRef = useRef<HTMLDivElement>(null);
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
      useSettingsStore.getState().loadSettings({ syncStartupTheme: false });
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
      useSettingsStore.getState().loadSettings({ syncStartupTheme: false });
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
      useSettingsStore.getState().loadSettings({ syncStartupTheme: false });
      refresh();
    });
    return () => {
      off?.();
    };
  }, [refresh]);

  useEffect(() => {
    if (!projectMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!projectPickerRef.current?.contains(event.target as Node)) setProjectMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProjectMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [projectMenuOpen]);

  const handleProjectChange = (nextProjectId: string) => {
    // 项目 id 与对应列表必须在同一次 React 提交中更新，避免中间一帧显示新项目名和旧事项。
    projectIdRef.current = nextProjectId;
    setProjectId(nextProjectId);
    setTodos(loadActiveTodos(nextProjectId));
    setProjectMenuOpen(false);
    void window.electronAPI?.setStickerProject(stickerId, nextProjectId);
  };
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
  const contextMenuItems: ContextMenuItem[] = [
    {
      label: '复制贴图',
      disabled: !projectId,
      onClick: () => {
        void window.electronAPI?.duplicateSticker(stickerId, projectId);
      },
    },
    { separator: true },
    {
      label: '关闭贴图',
      onClick: () => {
        void window.electronAPI?.closeSticker(stickerId);
      },
    },
  ];
  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenuPosition({ x: event.clientX, y: event.clientY });
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
      // 使用捕获阶段，确保任务按钮、项目选择器等原生/交互控件不会拦截右键菜单。
      onContextMenuCapture={handleContextMenu}
    >
      <header className="sticker-drag sticker-header">
        <div ref={projectPickerRef} className="sticker-no-drag sticker-project-picker">
          <button
            type="button"
            className="sticker-project"
            aria-label="选择贴图项目"
            aria-haspopup="listbox"
            aria-expanded={projectMenuOpen}
            onClick={() => setProjectMenuOpen((open) => !open)}
          >
            {project?.name ?? '选择一个项目'}
          </button>
          {projectMenuOpen && (
            <div className="sticker-project-menu" role="listbox" aria-label="贴图项目列表">
              {projects.map((item) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={item.id === projectId}
                  className="sticker-project-option"
                  key={item.id}
                  onClick={() => handleProjectChange(item.id)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          )}
        </div>
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
        <StickerTodoList
          key={projectId}
          todos={todos}
          ready={ready}
          onToggle={(todo) => void toggle(todo)}
        />
      </div>
      {contextMenuPosition && (
        <ContextMenu
          x={contextMenuPosition.x}
          y={contextMenuPosition.y}
          items={contextMenuItems}
          onClose={() => setContextMenuPosition(null)}
        />
      )}
    </div>
  );
}
