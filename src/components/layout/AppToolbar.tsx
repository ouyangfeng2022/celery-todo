/**
 * @file AppToolbar - 窗口左上角全局工具带
 * @description 集中承载应用菜单、侧边栏开关与搜索入口，保持主内容标题栏简洁。
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  DownloadIcon,
  FolderPlusIcon,
  FocusIcon,
  MenuIcon,
  SearchIcon,
  SidebarIcon,
  UploadIcon,
  XIcon,
} from '../common/Icons';
import { SearchBar } from '../filters/SearchBar';

interface AppToolbarProps {
  sidebarOpen: boolean;
  search: string;
  searchFocusSignal: number;
  onToggleSidebar: () => void;
  onSearchChange: (value: string) => void;
  onImport: (file: File) => void;
  onExportAll: () => void;
  onExportCsv: () => void;
  onCreateProject: () => void;
  onEnterCompactMode: () => void;
  onCloseWindow: () => void;
}

type ToolAction =
  'new-project' | 'import' | 'export-all' | 'export-csv' | 'compact' | 'close';

interface ToolMenuItem {
  label: string;
  hint?: string;
  icon: typeof MenuIcon;
  action: ToolAction;
}

interface ToolMenuGroup {
  /** 分组标题，提供视觉分层；不参与交互 */
  title: string;
  items: ToolMenuItem[];
}

// 左上角菜单按功能分层：每组带一个小标题，避免 7 项扁平罗列难以扫视。
const MENU_GROUPS: ToolMenuGroup[] = [
  {
    title: '项目',
    items: [{ label: '新建项目', icon: FolderPlusIcon, action: 'new-project' }],
  },
  {
    title: '数据',
    items: [
      { label: '导入数据…', icon: UploadIcon, action: 'import' },
      { label: '导出全部数据', icon: DownloadIcon, action: 'export-all' },
      { label: '导出当前列表', icon: DownloadIcon, action: 'export-csv' },
    ],
  },
  {
    title: '窗口',
    items: [
      { label: '进入简洁模式', icon: FocusIcon, action: 'compact' },
      { label: '关闭窗口', icon: XIcon, action: 'close' },
    ],
  },
];

function AppToolbarComponent({
  sidebarOpen,
  search,
  searchFocusSignal,
  onToggleSidebar,
  onSearchChange,
  onImport,
  onExportAll,
  onExportCsv,
  onCreateProject,
  onEnterCompactMode,
  onCloseWindow,
}: AppToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [manualSearchFocusSignal, setManualSearchFocusSignal] = useState(0);
  // 当前展开的多级分组（悬停某分组标题时设为该分组标题，离开时清空）
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  // 子菜单顶端纵坐标（相对工具带容器）：让子菜单从悬停的分组行开始，而非主菜单顶部
  const [submenuTop, setSubmenuTop] = useState<number | null>(null);
  // 工具带根节点引用，用于判断点击是否落在工具带外部
  const containerRef = useRef<HTMLDivElement>(null);
  // 各分组标题按钮引用：按 title 取其屏幕位置，计算子菜单顶端
  const groupButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  // 延迟关闭子菜单的计时器：允许鼠标在主菜单与子菜单之间的间隙短暂偏移而不收回
  const groupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ctrl+F 等外部聚焦信号到来时，同时展开左上角搜索框。
  useEffect(() => {
    if (searchFocusSignal > 0) {
      setMenuOpen(false);
      setSearchOpen(true);
    }
  }, [searchFocusSignal]);

  // 关闭主菜单/搜索弹层时一并收起多级子菜单与悬停计时器。
  const closeAllPanels = useCallback(() => {
    setMenuOpen(false);
    setSearchOpen(false);
    setOpenGroup(null);
    setSubmenuTop(null);
    if (groupTimerRef.current) {
      clearTimeout(groupTimerRef.current);
      groupTimerRef.current = null;
    }
  }, []);

  // 点击工具带外部或按下 Escape 时收起菜单/搜索弹层（与 ContextMenu 行为一致）。
  // 用 mousedown 而非 click，避免先触发其它交互再关弹层。
  useEffect(() => {
    if (!menuOpen && !searchOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeAllPanels();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 子菜单已展开时先收起子菜单，再次按 Esc 才关主菜单
        if (openGroup) setOpenGroup(null);
        else closeAllPanels();
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen, searchOpen, openGroup, closeAllPanels]);

  // 悬停某分组：立即展开该子菜单，按该行顶端定位，并取消任何待关闭计时器。
  const handleGroupEnter = useCallback((title: string) => {
    if (groupTimerRef.current) {
      clearTimeout(groupTimerRef.current);
      groupTimerRef.current = null;
    }
    // 子菜单顶端对齐到悬停的分组行（相对工具带容器）
    const btn = groupButtonRefs.current.get(title);
    const container = containerRef.current;
    if (btn && container) {
      setSubmenuTop(btn.getBoundingClientRect().top - container.getBoundingClientRect().top);
    }
    setOpenGroup(title);
  }, []);

  // 离开分组：延迟收起，给鼠标穿越主/子菜单间隙留出时间。
  const handleGroupLeave = useCallback(() => {
    if (groupTimerRef.current) clearTimeout(groupTimerRef.current);
    groupTimerRef.current = setTimeout(() => setOpenGroup(null), 120);
  }, []);

  // 卸载时清理计时器，避免泄漏。
  useEffect(() => () => {
    if (groupTimerRef.current) clearTimeout(groupTimerRef.current);
  }, []);

  const handleImportClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) onImport(file);
    };
    input.click();
  }, [onImport]);

  const runMenuAction = useCallback(
    (action: ToolAction) => {
      closeAllPanels();
      if (action === 'new-project') onCreateProject();
      if (action === 'import') handleImportClick();
      if (action === 'export-all') onExportAll();
      if (action === 'export-csv') onExportCsv();
      if (action === 'compact') onEnterCompactMode();
      if (action === 'close') onCloseWindow();
    },
    [
      closeAllPanels,
      handleImportClick,
      onCloseWindow,
      onCreateProject,
      onEnterCompactMode,
      onExportAll,
      onExportCsv,
    ],
  );

  const iconButtonClass =
    'titlebar-no-drag flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';

  return (
    <div
      ref={containerRef}
      className="titlebar-no-drag pointer-events-auto absolute left-2 top-2 z-50"
    >
      <div className="titlebar-no-drag flex items-center gap-0.5">
        <button
          className={iconButtonClass}
          style={{ color: 'var(--text-secondary)' }}
          aria-label="打开应用菜单"
          aria-expanded={menuOpen}
          onClick={() => {
            setSearchOpen(false);
            setOpenGroup(null);
            setMenuOpen((value) => !value);
          }}
        >
          <MenuIcon size={16} />
        </button>
        <button
          className={iconButtonClass}
          style={{ color: 'var(--text-secondary)' }}
          aria-label={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
          title={`${sidebarOpen ? '收起' : '展开'}侧边栏 (Ctrl+B)`}
          onClick={onToggleSidebar}
        >
          <SidebarIcon size={16} open={sidebarOpen} />
        </button>
        <button
          className={iconButtonClass}
          style={{ color: searchOpen || search ? 'var(--accent)' : 'var(--text-secondary)' }}
          aria-label="搜索事项"
          aria-expanded={searchOpen}
          title="搜索事项 (Ctrl+F)"
          onClick={() => {
            setMenuOpen(false);
            setSearchOpen((value) => {
              if (!value) setManualSearchFocusSignal((signal) => signal + 1);
              return !value;
            });
          }}
        >
          <SearchIcon size={16} />
        </button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="main-menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="titlebar-no-drag pointer-events-auto absolute left-0 top-10 w-36 rounded-xl border p-1.5"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              borderColor: 'var(--border-color)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            {MENU_GROUPS.map((group, groupIndex) => {
              const isOpen = openGroup === group.title;
              return (
                <div
                  key={group.title}
                  className={groupIndex > 0 ? 'mt-1 border-t pt-1' : undefined}
                  style={groupIndex > 0 ? { borderColor: 'var(--border-color)' } : undefined}
                >
                  <button
                    // 记录按钮引用，用于子菜单顶端对齐；卸载时清理
                    ref={(el) => {
                      if (el) groupButtonRefs.current.set(group.title, el);
                      else groupButtonRefs.current.delete(group.title);
                    }}
                    // 悬停即展开子菜单；点击亦可切换，便于触屏/精确操作
                    onMouseEnter={() => handleGroupEnter(group.title)}
                    onMouseLeave={handleGroupLeave}
                    onClick={() => setOpenGroup(isOpen ? null : group.title)}
                    className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-[var(--bg-hover)]"
                    style={{
                      color: isOpen ? 'var(--accent)' : 'var(--text-secondary)',
                      backgroundColor: isOpen ? 'var(--accent-subtle)' : undefined,
                    }}
                    aria-haspopup="menu"
                    aria-expanded={isOpen}
                  >
                    {group.title}
                  </button>
                </div>
              );
            })}
          </motion.div>
        )}

        {/* 多级子菜单：挂在主菜单右侧，与悬停的分组对齐。 */}
        <AnimatePresence>
          {menuOpen && openGroup && (
            <motion.div
              key={`submenu-${openGroup}`}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              transition={{ duration: 0.12 }}
              onMouseEnter={() => handleGroupEnter(openGroup)}
              onMouseLeave={handleGroupLeave}
              className="titlebar-no-drag pointer-events-auto absolute left-[9.125rem] w-56 rounded-xl border p-1.5"
              style={{
                // 子菜单从悬停的分组行顶端开始，而非主菜单顶部；测量前回退到 top-10
                top: submenuTop ?? '2.5rem',
                backgroundColor: 'var(--bg-tertiary)',
                borderColor: 'var(--border-color)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              {MENU_GROUPS.find((g) => g.title === openGroup)?.items.map(
                ({ label, icon: Icon, action, ...item }) => (
                  <button
                    key={action}
                    onClick={() => runMenuAction(action)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Icon size={15} />
                    <span className="flex-1">{label}</span>
                    {item.hint && (
                      <span className="text-[10px]" style={{ color: 'var(--text-quaternary)' }}>
                        {item.hint}
                      </span>
                    )}
                  </button>
                ),
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {searchOpen && (
          <motion.div
            key="search-panel"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="titlebar-no-drag pointer-events-auto absolute left-[68px] top-0 w-72 rounded-xl border p-1.5"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              borderColor: 'var(--border-color)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <SearchBar
              value={search}
              onChange={onSearchChange}
              focusSignal={searchFocusSignal + manualSearchFocusSignal}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const AppToolbar = memo(AppToolbarComponent);
