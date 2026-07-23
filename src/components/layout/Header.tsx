/**
 * @file Header - 顶部导航栏
 * @description 单行顶部栏:左侧 = 应用菜单 / 侧边栏开关 / 搜索(原浮动 AppToolbar 已合并进来),
 * 中部 = 项目标题,右侧 = 更新徽标。右上角原生 overlay 控制按钮占用约 152px,故整条右留白。
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SearchBar } from '../filters/SearchBar';
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

interface HeaderProps {
  // === 工具组(原 AppToolbar 的 props) ===
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
  | 'new-project'
  | 'import'
  | 'export-all'
  | 'export-csv'
  | 'compact'
  | 'close';

interface ToolMenuItem {
  label: string;
  hint?: string;
  icon: typeof MenuIcon;
  action: ToolAction;
}

interface ToolMenuGroup {
  /** 分组标题,提供视觉分层;不参与交互 */
  title: string;
  items: ToolMenuItem[];
}

// 顶部栏菜单按功能分层:每组带一个小标题,避免 7 项扁平罗列难以扫视。
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

function HeaderComponent({
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
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [manualSearchFocusSignal, setManualSearchFocusSignal] = useState(0);
  // 当前展开的多级分组(悬停某分组标题时设为该分组标题,离开时清空)
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  // 子菜单顶端纵坐标(相对 header):让子菜单从悬停的分组行开始,而非主菜单顶部
  const [submenuTop, setSubmenuTop] = useState<number | null>(null);
  // header 根节点引用,用于判断点击是否落在 header 外部
  const headerRef = useRef<HTMLElement>(null);
  // 各分组标题按钮引用:按 title 取其屏幕位置,计算子菜单顶端
  const groupButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  // 搜索按钮引用:用于把搜索面板锚定到按钮下方
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  // 搜索面板左偏移(相对 header):对齐到搜索按钮
  const [searchLeft, setSearchLeft] = useState<number>(0);
  // 延迟关闭子菜单的计时器:允许鼠标在主菜单与子菜单之间的间隙短暂偏移而不收回
  const groupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ctrl+F 等外部聚焦信号到来时,同时展开搜索框。
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

  // 点击 header 外部或按下 Escape 时收起菜单/搜索弹层(与 ContextMenu 行为一致)。
  // 用 mousedown 而非 click,避免先触发其它交互再关弹层。
  useEffect(() => {
    if (!menuOpen && !searchOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        closeAllPanels();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 子菜单已展开时先收起子菜单,再次按 Esc 才关主菜单
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

  // 悬停某分组:立即展开该子菜单,按该行顶端定位,并取消任何待关闭计时器。
  const handleGroupEnter = useCallback((title: string) => {
    if (groupTimerRef.current) {
      clearTimeout(groupTimerRef.current);
      groupTimerRef.current = null;
    }
    // 子菜单顶端对齐到悬停的分组行(相对 header)
    const btn = groupButtonRefs.current.get(title);
    const header = headerRef.current;
    if (btn && header) {
      setSubmenuTop(btn.getBoundingClientRect().top - header.getBoundingClientRect().top);
    }
    setOpenGroup(title);
  }, []);

  // 离开分组:延迟收起,给鼠标穿越主/子菜单间隙留出时间。
  const handleGroupLeave = useCallback(() => {
    if (groupTimerRef.current) clearTimeout(groupTimerRef.current);
    groupTimerRef.current = setTimeout(() => setOpenGroup(null), 120);
  }, []);

  // 卸载时清理计时器,避免泄漏。
  useEffect(
    () => () => {
      if (groupTimerRef.current) clearTimeout(groupTimerRef.current);
    },
    [],
  );

  // 展开搜索时计算面板左偏移(对齐搜索按钮),覆盖默认 0。
  // 每次打开都重算,适配窗口宽度变化导致按钮位置漂移。
  useEffect(() => {
    if (searchOpen && searchButtonRef.current && headerRef.current) {
      const btnRect = searchButtonRef.current.getBoundingClientRect();
      const headerRect = headerRef.current.getBoundingClientRect();
      setSearchLeft(Math.max(0, btnRect.left - headerRect.left));
    }
  }, [searchOpen]);

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
    <header
      ref={headerRef}
      // z-50:Header 内的下拉菜单(搜索/菜单/子菜单)需浮于 main 区吸顶 AddTodoInput(z-20)
      // 之上,否则「清除搜索」等按钮会被吸顶容器遮挡、点不到。
      // 背景 var(--bg-secondary)(暖米色):与右上/左下同色,合成视觉 L 形(主区为暖纸色 --bg-primary)。
      // 位于左上象限(256px 宽列),工具组靠左,右侧空白处可拖拽整窗。
      className="relative z-50 flex h-full w-full items-center gap-3 px-3 py-2"
      style={{
        backgroundColor: 'var(--bg-secondary)',
      }}
    >
      {/*
        拖拽区:覆盖工具组右侧到本象限右边缘之间的空白。
        Electron 会优先把 drag 区域交给原生窗口处理,即使工具视觉层级更高也收不到点击,
        故工具组用 titlebar-no-drag 排除,只让空白处参与拖拽。
      */}
      <div
        aria-hidden="true"
        className="titlebar-drag pointer-events-auto absolute inset-y-0 right-0"
        style={{ left: '124px' }}
      />

      {/* 工具组:菜单 / 侧边栏开关 / 搜索。
          整个 header 已是 z-50(浮于 main 吸顶 AddTodoInput 之上),这里仅需在 header
          内部把下拉菜单钉在拖拽层之上。 */}
      <div className="titlebar-no-drag relative z-30 flex items-center gap-0.5">
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
          ref={searchButtonRef}
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

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              key="main-menu"
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.14 }}
              className="titlebar-no-drag pointer-events-auto absolute left-0 top-full mt-1 w-36 rounded-xl border p-1.5"
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
                      // 记录按钮引用,用于子菜单顶端对齐;卸载时清理
                      ref={(el) => {
                        if (el) groupButtonRefs.current.set(group.title, el);
                        else groupButtonRefs.current.delete(group.title);
                      }}
                      // 悬停即展开子菜单;点击亦可切换,便于触屏/精确操作
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

          {/* 多级子菜单:挂在主菜单右侧,与悬停的分组对齐。 */}
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
                  // 子菜单从悬停的分组行顶端开始,而非主菜单顶部;测量前回退到 top-full
                  top: submenuTop ?? '100%',
                  marginTop: '0.25rem',
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
              className="titlebar-no-drag pointer-events-auto absolute top-full mt-1 w-72 rounded-xl border p-1.5"
              style={{
                left: `${searchLeft}px`,
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
    </header>
  );
}

export const Header = memo(HeaderComponent);
