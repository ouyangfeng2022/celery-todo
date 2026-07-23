import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppToolbar } from '@/components/layout/AppToolbar';

function renderToolbar(overrides: Partial<React.ComponentProps<typeof AppToolbar>> = {}) {
  const props: React.ComponentProps<typeof AppToolbar> = {
    sidebarOpen: true,
    search: '',
    searchFocusSignal: 0,
    onToggleSidebar: vi.fn(),
    onSearchChange: vi.fn(),
    onImport: vi.fn(),
    onExportAll: vi.fn(),
    onExportCsv: vi.fn(),
    onCreateProject: vi.fn(),
    onEnterCompactMode: vi.fn(),
    onCloseWindow: vi.fn(),
    ...overrides,
  };
  render(<AppToolbar {...props} />);
  return props;
}

describe('AppToolbar', () => {
  it('在左上工具带切换侧边栏', () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: '收起侧边栏' }));
    expect(props.onToggleSidebar).toHaveBeenCalledOnce();
  });

  it('侧边栏收起后仍可恢复，并能操作菜单与搜索', () => {
    const props = renderToolbar({ sidebarOpen: false });

    fireEvent.click(screen.getByRole('button', { name: '展开侧边栏' }));
    expect(props.onToggleSidebar).toHaveBeenCalledOnce();

    // 打开主菜单 → 展开「项目」分组 → 点击「新建项目」
    fireEvent.click(screen.getByRole('button', { name: '打开应用菜单' }));
    fireEvent.click(screen.getByRole('button', { name: '项目' }));
    fireEvent.click(screen.getByRole('button', { name: /新建项目/ }));
    expect(props.onCreateProject).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: '搜索事项' }));
    expect(screen.getByPlaceholderText('搜索事项...')).toHaveFocus();
  });

  it('点击搜索按钮后展开并聚焦搜索框', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: '搜索事项' }));
    expect(screen.getByPlaceholderText('搜索事项...')).toHaveFocus();
  });

  it('从工具列表创建项目', () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: '打开应用菜单' }));
    // 「新建项目」收在「项目」分组里，需先展开分组
    fireEvent.click(screen.getByRole('button', { name: '项目' }));
    fireEvent.click(screen.getByRole('button', { name: /新建项目/ }));
    expect(props.onCreateProject).toHaveBeenCalledOnce();
  });

  it('主菜单按分组分层，项收在子菜单中', () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: '打开应用菜单' }));
    // 主菜单只有三个分组标题（项目/数据/窗口），不直接暴露具体操作项
    expect(screen.getByRole('button', { name: '项目' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '数据' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '窗口' })).toBeInTheDocument();
    // 帮助与反馈已移至左下角设置菜单，不应出现在这里
    expect(screen.queryByRole('button', { name: '帮助与反馈' })).not.toBeInTheDocument();
    // 展开数据分组后才能点到「导出全部数据」
    fireEvent.click(screen.getByRole('button', { name: '数据' }));
    fireEvent.click(screen.getByRole('button', { name: '导出全部数据' }));
    expect(props.onExportAll).toHaveBeenCalledOnce();
  });
});
