import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Header } from '@/components/layout/Header';

function renderHeader(overrides: Partial<React.ComponentProps<typeof Header>> = {}) {
  const props: React.ComponentProps<typeof Header> = {
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
  render(<Header {...props} />);
  return props;
}

describe('Header', () => {
  it('在顶部栏切换侧边栏', () => {
    const props = renderHeader();
    fireEvent.click(screen.getByRole('button', { name: '收起侧边栏' }));
    expect(props.onToggleSidebar).toHaveBeenCalledOnce();
  });

  it('侧边栏收起后顶部工具栏仍可恢复侧边栏并操作菜单', () => {
    const props = renderHeader({ sidebarOpen: false });

    expect(screen.queryByRole('button', { name: '搜索所有项目中的事项' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '展开侧边栏' }));
    expect(props.onToggleSidebar).toHaveBeenCalledOnce();

    // 直接展开「项目」分组子菜单 → 点击「新建项目」
    fireEvent.click(screen.getByRole('button', { name: '项目' }));
    fireEvent.click(screen.getByRole('button', { name: /新建项目/ }));
    expect(props.onCreateProject).toHaveBeenCalledOnce();
  });

  it('点击搜索按钮后展开并聚焦搜索框', () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: '搜索所有项目中的事项' }));
    expect(screen.getByPlaceholderText('搜索所有项目中的事项...')).toHaveFocus();
  });

  it('展示全局结果并将选中项交给上层跳转', () => {
    const props = renderHeader({
      search: '周报',
      searchResults: [
        {
          todo: {
            id: 'todo-1',
            projectId: 'project-1',
            title: '完成周报',
            description: '整理本周进展',
            completed: false,
            priority: 'high',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            order: 0,
            pinned: false,
          },
          project: {
            id: 'project-1',
            name: '工作',
            color: '#ef4444',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            order: 0,
          },
          matchedText: '整理本周进展',
        },
      ],
      onSelectSearchResult: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: '搜索所有项目中的事项' }));
    expect(screen.getByRole('listbox', { name: '全局搜索结果' })).toBeInTheDocument();
    expect(screen.getByText('工作')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /完成周报/ }));
    expect(props.onSelectSearchResult).toHaveBeenCalledWith(props.searchResults?.[0]);
  });

  it('从工具列表创建项目', () => {
    const props = renderHeader();
    // 「新建项目」收在「项目」分组里,直接展开该分组子菜单即可
    fireEvent.click(screen.getByRole('button', { name: '项目' }));
    fireEvent.click(screen.getByRole('button', { name: /新建项目/ }));
    expect(props.onCreateProject).toHaveBeenCalledOnce();
  });

  it('主菜单按分组分层，项收在子菜单中', () => {
    const props = renderHeader();
    // 顶部工具栏直接平铺三个分组标题(项目/数据/窗口),不直接暴露具体操作项
    expect(screen.getByRole('button', { name: '项目' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '数据' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '窗口' })).toBeInTheDocument();
    // 帮助与反馈已移至左下角设置菜单,不应出现在这里
    expect(screen.queryByRole('button', { name: '帮助与反馈' })).not.toBeInTheDocument();
    // 展开数据分组后才能点到「导出全部数据」
    fireEvent.click(screen.getByRole('button', { name: '数据' }));
    fireEvent.click(screen.getByRole('button', { name: '导出全部数据' }));
    expect(props.onExportAll).toHaveBeenCalledOnce();
  });
});
