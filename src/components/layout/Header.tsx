/**
 * @file Header - 顶部导航栏
 * @description 单行顶部栏:左侧 = 应用菜单 / 侧边栏开关 / 搜索(原浮动 AppToolbar 已合并进来),
 * 中部 = 项目标题,右侧 = 更新徽标。右上角原生 overlay 控制按钮占用约 152px,故整条右留白。
 *
 * 弹出层定位:主菜单 / 多级子菜单 / 搜索面板均通过 createPortal 渲染到 document.body,
 * 用 fixed + 屏幕坐标(getBoundingClientRect)锚定到对应触发按钮。原因是 Header 位于左上
 * 象限的 .sidebar-shell 容器内,该容器带 overflow-hidden + contain:paint(服务于侧栏折叠
 * 动画),absolute 定位的弹出层会被裁切。portal 让弹出层脱离该裁剪上下文,与 ContextMenu
 * 的处理方式一致。
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  // 三个弹出层的屏幕坐标(viewport 坐标):portal + fixed 定位用。
  // 主菜单 / 搜索面板锚定到各自触发按钮的左下角;子菜单锚定到悬停分组行的右上角。
  // 展开时一次性测量并缓存,避免每帧重算;窗口/滚动变化时弹出层会直接关闭(见关闭机制)。
  const [mainMenuPos, setMainMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [submenuPos, setSubmenuPos] = useState<{ left: number; top: number } | null>(null);
  const [searchPos, setSearchPos] = useState<{ left: number; top: number } | null>(null);
  // header 根节点引用,用于判断点击是否落在 header 外部
  const headerRef = useRef<HTMLElement>(null);
  // 菜单按钮引用:展开主菜单时测量其屏幕坐标
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  // 各分组标题按钮引用:按 title 取其屏幕位置,计算子菜单锚点
  const groupButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  // 搜索按钮引用:用于把搜索面板锚定到按钮下方
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  // 弹出层 DOM 引用:外部点击判定需覆盖 portal 节点(portal 不在 headerRef 树内)
  const mainMenuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  // 延迟关闭子菜单的计时器:允许鼠标在主菜单与子菜单之间的间隙短暂偏移而不收回
  const groupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ctrl+F 等外部聚焦信号到来时,同时展开搜索框。
  useEffect(() => {
    if (searchFocusSignal > 0) {
      setMenuOpen(false);
      setMainMenuPos(null);
      setOpenGroup(null);
      setSubmenuPos(null);
      // 外部信号打开时同样需测量搜索按钮坐标给 portal 用。
      if (searchButtonRef.current) {
        const rect = searchButtonRef.current.getBoundingClientRect();
        setSearchPos({ left: rect.left, top: rect.bottom + 4 });
      }
      setSearchOpen(true);
    }
  }, [searchFocusSignal]);

  // 关闭主菜单/搜索弹层时一并收起多级子菜单、坐标缓存与悬停计时器。
  const closeAllPanels = useCallback(() => {
    setMenuOpen(false);
    setSearchOpen(false);
    setOpenGroup(null);
    setMainMenuPos(null);
    setSubmenuPos(null);
    setSearchPos(null);
    if (groupTimerRef.current) {
      clearTimeout(groupTimerRef.current);
      groupTimerRef.current = null;
    }
  }, []);

  // 点击 header / 任一弹出层外部,或按下 Escape 时收起菜单/搜索弹层(与 ContextMenu 行为一致)。
  // 弹出层走 portal 渲染到 document.body,不在 headerRef 树内,故需单独判定其 ref。
  // 用 mousedown 而非 click,避免先触发其它交互再关弹层。
  useEffect(() => {
    if (!menuOpen && !searchOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (headerRef.current?.contains(target)) return;
      if (mainMenuRef.current?.contains(target)) return;
      if (submenuRef.current?.contains(target)) return;
      if (searchPanelRef.current?.contains(target)) return;
      closeAllPanels();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 子菜单已展开时先收起子菜单,再次按 Esc 才关主菜单
        if (openGroup) setOpenGroup(null);
        else closeAllPanels();
      }
    };
    // 滚动 / resize 会让缓存的屏幕坐标失效,直接关闭(与 ContextMenu 一致)。
    const handleLayoutChange = () => closeAllPanels();
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleLayoutChange);
    window.addEventListener('scroll', handleLayoutChange, true);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleLayoutChange);
      window.removeEventListener('scroll', handleLayoutChange, true);
    };
  }, [menuOpen, searchOpen, openGroup, closeAllPanels]);

  // 悬停某分组:立即展开该子菜单,按该行屏幕坐标定位,并取消任何待关闭计时器。
  const handleGroupEnter = useCallback((title: string) => {
    if (groupTimerRef.current) {
      clearTimeout(groupTimerRef.current);
      groupTimerRef.current = null;
    }
    // 子菜单锚定到悬停分组行的右上角(紧贴主菜单右侧),顶端与该行平齐。
    const btn = groupButtonRefs.current.get(title);
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setSubmenuPos({ left: rect.right + 4, top: rect.top });
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
          ref={menuButtonRef}
          className={iconButtonClass}
          style={{ color: 'var(--text-secondary)' }}
          aria-label="打开应用菜单"
          aria-expanded={menuOpen}
          onClick={() => {
            // 即将打开主菜单时,测量按钮屏幕坐标缓存给 portal 定位用。
            // 用 setMenuOpen 的函数式更新把「打开」与「测坐标」放一起,关闭时不重算。
            setMenuOpen((value) => {
              if (!value && menuButtonRef.current) {
                const rect = menuButtonRef.current.getBoundingClientRect();
                setMainMenuPos({ left: rect.left, top: rect.bottom + 4 });
              }
              return !value;
            });
            setSearchOpen(false);
            setSearchPos(null);
            setOpenGroup(null);
            setSubmenuPos(null);
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
            setMainMenuPos(null);
            setOpenGroup(null);
            setSubmenuPos(null);
            setSearchOpen((value) => {
              if (!value) {
                // 即将打开搜索面板时测量按钮屏幕坐标给 portal 用。
                if (searchButtonRef.current) {
                  const rect = searchButtonRef.current.getBoundingClientRect();
                  setSearchPos({ left: rect.left, top: rect.bottom + 4 });
                }
                setManualSearchFocusSignal((signal) => signal + 1);
              }
              return !value;
            });
          }}
        >
          <SearchIcon size={16} />
        </button>

        {/* 三个弹出层均通过 portal 渲染到 document.body,用 fixed + 屏幕坐标锚定,
            以脱离 .sidebar-shell 的 overflow-hidden + contain:paint 裁剪上下文。
            z-[60] 高于 Header 的 z-50,确保浮于所有内容之上(与 ContextMenu 同级)。 */}
        {createPortal(
          <AnimatePresence>
            {menuOpen && mainMenuPos && (
              <motion.div
                ref={mainMenuRef}
                key="main-menu"
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.14 }}
                className="titlebar-no-drag pointer-events-auto fixed z-[60] w-36 rounded-xl border p-1.5"
                style={{
                  left: mainMenuPos.left,
                  top: mainMenuPos.top,
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
                        // 记录按钮引用,用于子菜单锚点定位;卸载时清理
                        ref={(el) => {
                          if (el) groupButtonRefs.current.set(group.title, el);
                          else groupButtonRefs.current.delete(group.title);
                        }}
                        // 悬停即展开子菜单;点击亦可切换,便于触屏/精确操作。
                        // 展开路径走 handleGroupEnter(测屏幕坐标 + 设 openGroup),
                        // 否则 portal 子菜单因 submenuPos 缺失不渲染(纯点击/键盘场景)。
                        onMouseEnter={() => handleGroupEnter(group.title)}
                        onMouseLeave={handleGroupLeave}
                        onClick={() => {
                          if (isOpen) setOpenGroup(null);
                          else handleGroupEnter(group.title);
                        }}
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

            {/* 多级子菜单:挂在主菜单右侧,与悬停的分组行顶端对齐。 */}
            {menuOpen && openGroup && submenuPos && (
              <motion.div
                ref={submenuRef}
                key={`submenu-${openGroup}`}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.12 }}
                onMouseEnter={() => handleGroupEnter(openGroup)}
                onMouseLeave={handleGroupLeave}
                className="titlebar-no-drag pointer-events-auto fixed z-[60] w-56 rounded-xl border p-1.5"
                style={{
                  left: submenuPos.left,
                  top: submenuPos.top,
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

            {searchOpen && searchPos && (
              <motion.div
                ref={searchPanelRef}
                key="search-panel"
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.14 }}
                className="titlebar-no-drag pointer-events-auto fixed z-[60] w-72 rounded-xl border p-1.5"
                style={{
                  left: searchPos.left,
                  top: searchPos.top,
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
          </AnimatePresence>,
          document.body,
        )}
      </div>
    </header>
  );
}

export const Header = memo(HeaderComponent);
