/**
 * @file Header - 顶部导航栏
 * @description 顶部工具栏:左侧 = 侧边栏开关 + 三个分组标题(项目/数据/窗口);
 *              悬停或点击某分组标题即在下方展开其子菜单。搜索入口向下定位到侧边栏标题行。
 *
 * 弹出层定位:子菜单 / 搜索面板均通过 createPortal 渲染到 document.body,
 * 用 fixed + 屏幕坐标(getBoundingClientRect)锚定到对应触发按钮。portal 让弹出层脱离
 * 顶部栏自身的层叠上下文,与 ContextMenu 的处理方式一致。
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { SearchBar } from '../filters/SearchBar';
import { useDismissibleLayer } from '../../hooks/useDismissibleLayer';
import type { GlobalSearchResult } from '../../types';
import {
  ChevronLeftIcon,
  DownloadIcon,
  FolderPlusIcon,
  FocusIcon,
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
  searchResults?: GlobalSearchResult[];
  onSelectSearchResult?: (result: GlobalSearchResult) => void;
  onImport: (file: File) => void;
  onExportAll: () => void;
  onExportCsv: () => void;
  onCreateProject: () => void;
  onEnterCompactMode: () => void;
  onCloseWindow: () => void;
  // === 返回按钮(可选)。设置页等子页面传入,渲染在最左侧;主页面不传则不渲染 ===
  onBack?: () => void;
  backLabel?: string;
  backTitle?: string;
  // === 搜索激活钩子(可选)。
  //    主页面不传:点搜索按钮打开 Header 内置搜索面板(默认行为)。
  //    设置页等浮层语境传入:点搜索按钮时改由外部接管(例如先关浮层再聚焦主搜索),
  //    因为浮层会遮盖主页面 TodoList,内置搜索面板「能输入、看不到结果」。 ===
  onSearchActivate?: () => void;
  // === 是否渲染搜索按钮(可选,默认 true)。
  //    搜索目标永远是主页面的 TodoList,子页面(设置页)里搜索无意义,
  //    传 false 直接不渲染搜索按钮,比让按钮点了再跳转更干净。 ===
  showSearch?: boolean;
}

type ToolAction = 'new-project' | 'import' | 'export-all' | 'export-csv' | 'compact' | 'close';

interface ToolMenuItem {
  label: string;
  hint?: string;
  icon: typeof FolderPlusIcon;
  action: ToolAction;
}

interface ToolMenuGroup {
  /** 分组标题,直接平铺在顶部工具栏;悬停/点击展开其子菜单 */
  title: string;
  items: ToolMenuItem[];
}

// 顶部工具栏按功能分三个分组,每个分组的标题直接显示在工具栏上,悬停/点击即在下方展开子菜单。
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
  searchResults,
  onSelectSearchResult,
  onImport,
  onExportAll,
  onExportCsv,
  onCreateProject,
  onEnterCompactMode,
  onCloseWindow,
  onBack,
  backLabel = '返回',
  backTitle = '返回',
  onSearchActivate,
  showSearch = true,
}: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [manualSearchFocusSignal, setManualSearchFocusSignal] = useState(0);
  // 当前展开的分组(点击某分组标题时设为该分组标题,再次点击或外部点击时清空)
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  // 两个弹出层的屏幕坐标(viewport 坐标):portal + fixed 定位用。
  // 子菜单锚定到点击的分组标题按钮的左下角;搜索面板锚定到搜索按钮的左下角。
  // 展开时一次性测量并缓存,避免每帧重算;窗口/滚动变化时弹出层会直接关闭(见关闭机制)。
  const [submenuPos, setSubmenuPos] = useState<{ left: number; top: number } | null>(null);
  const [searchPos, setSearchPos] = useState<{ left: number; top: number } | null>(null);
  // 工具组容器引用:点击外部判定时,放行范围仅限工具组与搜索按钮,
  // 不再放行整个 header —— 否则点击 header 内空白(拖拽区、按钮间)也无法收起弹层。
  const toolbarRef = useRef<HTMLDivElement>(null);
  // 各分组标题按钮引用:按 title 取其屏幕位置,计算子菜单锚点
  const groupButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  // 搜索按钮引用:用于把搜索面板锚定到按钮下方;点击外部判定也会放行它
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  // 弹出层 DOM 引用:外部点击判定需覆盖 portal 节点(portal 不在 toolbarRef 树内)
  const submenuRef = useRef<HTMLDivElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);

  // Ctrl+F 等外部聚焦信号到来时,同时展开搜索框。
  useEffect(() => {
    if (searchFocusSignal > 0) {
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

  // 搜索入口属于侧边栏；侧边栏收起时同步关闭搜索弹层，避免浮层留在主区。
  useEffect(() => {
    if (!sidebarOpen) {
      setSearchOpen(false);
      setSearchPos(null);
    }
  }, [sidebarOpen]);

  // 关闭子菜单/搜索弹层时一并清空坐标缓存。
  const closeAllPanels = useCallback(() => {
    setSearchOpen(false);
    setOpenGroup(null);
    setSubmenuPos(null);
    setSearchPos(null);
  }, []);

  useDismissibleLayer(
    Boolean(openGroup || searchOpen),
    [toolbarRef, searchButtonRef, submenuRef, searchPanelRef],
    closeAllPanels,
  );

  // 窗口尺寸或滚动变化会让 portal 的缓存坐标失效，直接关闭浮层。
  // 外部点击和 Escape 统一由 useDismissibleLayer 处理。
  useEffect(() => {
    if (!openGroup && !searchOpen) return;
    const handleLayoutChange = () => closeAllPanels();
    window.addEventListener('resize', handleLayoutChange);
    window.addEventListener('scroll', handleLayoutChange, true);
    return () => {
      window.removeEventListener('resize', handleLayoutChange);
      window.removeEventListener('scroll', handleLayoutChange, true);
    };
  }, [openGroup, searchOpen, closeAllPanels]);

  // 点击某分组标题:展开该子菜单,按按钮屏幕坐标定位 portal 锚点。
  const handleGroupEnter = useCallback((title: string) => {
    // 子菜单锚定到点击的分组标题按钮的左下角(与搜索面板一致)。
    const btn = groupButtonRefs.current.get(title);
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setSubmenuPos({ left: rect.left, top: rect.bottom + 4 });
    }
    setOpenGroup(title);
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

  // 按钮高度统一 h-7(28px):与 text-sm(14px) 行高搭配,上下留白 ~5px,
  // 避免色块过高让文字显得"缩在中间"。横向 padding 同步收紧,
  // 让深色反馈框紧贴两字汉字标签(~28px),不再出现"大框 + 小字"。
  const iconButtonClass =
    'titlebar-no-drag flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';
  // 分组标题按钮:文字按钮,与图标按钮同高,宽度随文字自适应。
  // hover 只显示阴影(bg-hover 反馈)用于提示「这里可点」,不再触发展开 ——
  // 展开完全交给 onClick。激活态(open)由下方 style 的 accent-subtle 底色表达。
  const groupButtonClass =
    'titlebar-no-drag flex h-7 items-center rounded-lg px-2 text-sm transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';

  return (
    <header
      // z-50:Header 内的下拉菜单(子菜单/搜索)需浮于 main 区吸顶 AddTodoInput(z-20)
      // 之上,否则「清除搜索」等按钮会被吸顶容器遮挡、点不到。
      // 背景 var(--bg-frame)(暖陶土橙):与标题区、左侧栏同色(主区为暖纸色 --bg-primary)。
      // 位于顶部栏左侧,工具组靠左,右侧空白处可拖拽整窗。
      className="relative z-50 flex h-full w-full items-center gap-3 px-3 py-2"
      style={{
        backgroundColor: 'var(--bg-frame)',
      }}
    >
      {/*
        工具组:侧边栏开关 + 三个分组标题(项目/数据/窗口)。
        整个 header 已是 z-50(浮于 main 吸顶 AddTodoInput 之上),这里仅需在 header
        内部把下拉菜单钉在拖拽层之上。
      */}
      <div ref={toolbarRef} className="titlebar-no-drag relative z-30 flex items-center gap-0.5">
        {/* 返回按钮:仅子页面(如设置页)传入 onBack 时渲染,排在侧栏开关左侧。
            主页面不传 → 不渲染,工具组与原有视觉零差异。 */}
        {onBack && (
          <button
            className={iconButtonClass}
            style={{ color: 'var(--text-secondary)' }}
            aria-label={backLabel}
            title={backTitle}
            onClick={onBack}
          >
            <ChevronLeftIcon size={16} />
          </button>
        )}
        <button
          className={iconButtonClass}
          style={{ color: 'var(--text-secondary)' }}
          aria-label={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
          title={`${sidebarOpen ? '收起' : '展开'}侧边栏 (Ctrl+B)`}
          onClick={onToggleSidebar}
        >
          <SidebarIcon size={16} open={sidebarOpen} />
        </button>
        {MENU_GROUPS.map((group) => {
          const isOpen = openGroup === group.title;
          return (
            <button
              key={group.title}
              // 记录按钮引用,用于子菜单锚点定位;卸载时清理
              ref={(el) => {
                if (el) groupButtonRefs.current.set(group.title, el);
                else groupButtonRefs.current.delete(group.title);
              }}
              // 纯点击交互:点击展开,再次点击或点击外部收起。
              // 展开路径走 handleGroupEnter(测屏幕坐标 + 设 openGroup),
              // 收起路径走 setOpenGroup(null) —— 此时 submenuPos 仍存但 openGroup 为 null,
              // portal 子菜单因 openGroup 缺失不渲染。
              onClick={() => {
                if (isOpen) setOpenGroup(null);
                else handleGroupEnter(group.title);
              }}
              className={groupButtonClass}
              style={{
                color: isOpen ? 'var(--accent)' : 'var(--text-secondary)',
                backgroundColor: isOpen ? 'var(--accent-subtle)' : undefined,
              }}
              aria-haspopup="menu"
              aria-expanded={isOpen}
            >
              {group.title}
            </button>
          );
        })}

        {/* 子菜单与搜索面板均通过 portal 渲染到 document.body,用 fixed + 屏幕坐标锚定。
            z-[60] 高于 Header 的 z-50,确保浮于所有内容之上(与 ContextMenu 同级)。 */}
        {createPortal(
          <AnimatePresence>
            {/* 子菜单:挂在悬停分组标题按钮的正下方。 */}
            {openGroup && submenuPos && (
              <motion.div
                ref={submenuRef}
                key={`submenu-${openGroup}`}
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.14 }}
                className="titlebar-no-drag pointer-events-auto fixed z-[60] min-w-[12rem] py-1 rounded-xl border"
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
                      className="flex w-full items-center gap-2 px-3 py-1 text-left text-[13px] transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ color: 'var(--text-primary)' }}
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
                // 仅作为 portal 定位容器,卡片样式交给 SearchBar 自身渲染,
                // 否则会与 SearchBar 的 claude-card 形成双层卡片底。
                className="titlebar-no-drag pointer-events-auto fixed z-[60] w-72"
                style={{
                  left: searchPos.left,
                  top: searchPos.top,
                }}
              >
                <SearchBar
                  value={search}
                  onChange={onSearchChange}
                  results={searchResults}
                  onSelectResult={(result) => {
                    closeAllPanels();
                    onSelectSearchResult?.(result);
                  }}
                  focusSignal={searchFocusSignal + manualSearchFocusSignal}
                />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
      </div>

      {/*
        拖拽区:占满工具组右侧到 header 右边缘之间的空白(flex-1 自动让位给工具组实际宽度)。
        Electron 会优先把 drag 区域交给原生窗口处理,即使工具视觉层级更高也收不到点击,
        故工具组用 titlebar-no-drag 排除,只让空白处参与拖拽。
      */}
      <div aria-hidden="true" className="titlebar-drag pointer-events-auto h-full flex-1" />

      {/* 搜索属于侧边栏标题行，而不是顶部工具组。Header 容器允许溢出，
          因此可向下定位到下一行；侧边栏收起时随侧边栏内容一起隐藏。
          设置页等子页面传 showSearch={false} 不渲染搜索按钮 —— 搜索目标永远是
          主页面 TodoList,在子页面浮层里搜索结果会被遮盖、无意义。 */}
      {sidebarOpen && showSearch && (
        <button
          ref={searchButtonRef}
          className={`${iconButtonClass} absolute right-3 top-[calc(100%+8px)] z-40`}
          style={{ color: searchOpen || search ? 'var(--accent)' : 'var(--text-secondary)' }}
          aria-label="搜索所有项目中的事项"
          aria-expanded={searchOpen}
          title="搜索所有项目中的事项 (Ctrl+F)"
          onClick={() => {
            // 浮层语境(如设置页)传入 onSearchActivate 时,搜索改由外部接管 ——
            // 内置搜索面板虽能弹开,但结果在主页面 TodoList 会被浮层遮盖。
            if (onSearchActivate) {
              onSearchActivate();
              return;
            }
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
      )}
    </header>
  );
}

export const Header = memo(HeaderComponent);
