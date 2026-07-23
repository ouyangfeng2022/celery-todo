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
    onOpenHelp: vi.fn(),
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

    fireEvent.click(screen.getByRole('button', { name: '打开应用菜单' }));
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
    fireEvent.click(screen.getByRole('button', { name: /新建项目/ }));
    expect(props.onCreateProject).toHaveBeenCalledOnce();
  });

  it('工具列表只提供生产工具，不混入偏好设置', () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: '打开应用菜单' }));
    expect(screen.queryByRole('button', { name: '设置' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '导出全部数据' }));
    expect(props.onExportAll).toHaveBeenCalledOnce();
  });
});
