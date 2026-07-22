/**
 * @file AppToolbar - 窗口左上角全局工具带
 * @description 集中承载应用菜单、侧边栏开关与搜索入口，保持主内容标题栏简洁。
 */

import { memo, useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  DownloadIcon,
  FolderPlusIcon,
  FocusIcon,
  GithubIcon,
  InboxIcon,
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
  onOpenHistory: () => void;
  onImport: (file: File) => void;
  onExportAll: () => void;
  onExportCsv: () => void;
  onCreateProject: () => void;
  onEnterCompactMode: () => void;
  onCloseWindow: () => void;
  onOpenHelp: () => void;
}

type ToolAction =
  'new-project' | 'history' | 'import' | 'export-all' | 'export-csv' | 'compact' | 'close' | 'help';

interface ToolMenuItem {
  label: string;
  hint?: string;
  icon: typeof MenuIcon;
  action: ToolAction;
  dividerBefore?: boolean;
}

const MENU_ITEMS: ToolMenuItem[] = [
  { label: '新建项目', icon: FolderPlusIcon, action: 'new-project' },
  { label: '历史记录', icon: InboxIcon, action: 'history' },
  { label: '导入数据…', icon: UploadIcon, action: 'import', dividerBefore: true },
  { label: '导出全部数据', icon: DownloadIcon, action: 'export-all' },
  { label: '导出当前列表', icon: DownloadIcon, action: 'export-csv' },
  { label: '进入简洁模式', icon: FocusIcon, action: 'compact', dividerBefore: true },
  { label: '关闭窗口', icon: XIcon, action: 'close' },
  { label: '帮助与反馈', icon: GithubIcon, action: 'help', dividerBefore: true },
];

function AppToolbarComponent({
  sidebarOpen,
  search,
  searchFocusSignal,
  onToggleSidebar,
  onSearchChange,
  onOpenHistory,
  onImport,
  onExportAll,
  onExportCsv,
  onCreateProject,
  onEnterCompactMode,
  onCloseWindow,
  onOpenHelp,
}: AppToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [manualSearchFocusSignal, setManualSearchFocusSignal] = useState(0);

  // Ctrl+F 等外部聚焦信号到来时，同时展开左上角搜索框。
  useEffect(() => {
    if (searchFocusSignal > 0) {
      setMenuOpen(false);
      setSearchOpen(true);
    }
  }, [searchFocusSignal]);

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
      setMenuOpen(false);
      if (action === 'new-project') onCreateProject();
      if (action === 'history') onOpenHistory();
      if (action === 'import') handleImportClick();
      if (action === 'export-all') onExportAll();
      if (action === 'export-csv') onExportCsv();
      if (action === 'compact') onEnterCompactMode();
      if (action === 'close') onCloseWindow();
      if (action === 'help') onOpenHelp();
    },
    [
      handleImportClick,
      onCloseWindow,
      onCreateProject,
      onEnterCompactMode,
      onExportAll,
      onExportCsv,
      onOpenHelp,
      onOpenHistory,
    ],
  );

  const iconButtonClass =
    'titlebar-no-drag flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';

  return (
    <div className="titlebar-no-drag pointer-events-auto absolute left-2 top-2 z-50">
      <div className="titlebar-no-drag flex items-center gap-0.5">
        <button
          className={iconButtonClass}
          style={{ color: 'var(--text-secondary)' }}
          aria-label="打开应用菜单"
          aria-expanded={menuOpen}
          onClick={() => {
            setSearchOpen(false);
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
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="titlebar-no-drag pointer-events-auto absolute left-0 top-10 w-60 rounded-xl border p-1.5"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              borderColor: 'var(--border-color)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            {MENU_ITEMS.map(({ label, icon: Icon, action, ...item }) => (
              <div
                key={action}
                className={item.dividerBefore ? 'mt-1 border-t pt-1' : undefined}
                style={item.dividerBefore ? { borderColor: 'var(--border-color)' } : undefined}
              >
                <button
                  onClick={() => runMenuAction(action)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-hover)]"
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
              </div>
            ))}
          </motion.div>
        )}

        {searchOpen && (
          <motion.div
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
