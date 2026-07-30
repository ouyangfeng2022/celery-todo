import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectSidebar, SidebarUpdateCard } from '@/components/projects/ProjectSidebar';

describe('SidebarUpdateCard', () => {
  it('发现新版本时可从侧栏开始下载', () => {
    const onDownload = vi.fn();
    render(
      <SidebarUpdateCard status="available" info={{ version: '2.5.0' }} onDownload={onDownload} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /下载新版本 v2.5.0/ }));
    expect(onDownload).toHaveBeenCalledOnce();
  });

  it('下载时显示实时进度', () => {
    render(
      <SidebarUpdateCard
        status="downloading"
        progress={{ percent: 42.4, transferred: 424, total: 1000 }}
      />,
    );

    expect(screen.getByLabelText('正在下载更新 42%')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('下载完成后可重启完成更新', () => {
    const onRestart = vi.fn();
    render(
      <SidebarUpdateCard status="downloaded" info={{ version: '2.5.0' }} onRestart={onRestart} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /重启完成更新/ }));
    expect(onRestart).toHaveBeenCalledOnce();
  });
});

describe('ProjectSidebar 设置菜单', () => {
  it('左下角菜单包含「设置」「已归档事项」「帮助与反馈」', () => {
    const onOpenSettings = vi.fn();
    const onOpenHistory = vi.fn();
    const onOpenHelp = vi.fn();
    render(
      <ProjectSidebar
        projects={[]}
        activeProjectId=""
        onSwitch={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
        onReorder={vi.fn()}
        onOpenSettings={onOpenSettings}
        onOpenHistory={onOpenHistory}
        onOpenHelp={onOpenHelp}
        onNewTodoInProject={vi.fn()}
        onCreateSticker={vi.fn()}
        incompleteCounts={{}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '打开设置菜单' }));

    // 「设置」直接进入设置面板（默认通用分区）
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    expect(onOpenSettings).toHaveBeenCalledWith('general');
    expect(onOpenSettings).toHaveBeenCalledTimes(1);

    // 「已归档事项」打开归档弹窗
    fireEvent.click(screen.getByRole('button', { name: '打开设置菜单' }));
    fireEvent.click(screen.getByRole('button', { name: '已归档事项' }));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);

    // 「帮助与反馈」打开 GitHub 链接
    fireEvent.click(screen.getByRole('button', { name: '打开设置菜单' }));
    fireEvent.click(screen.getByRole('button', { name: '帮助与反馈' }));
    expect(onOpenHelp).toHaveBeenCalledTimes(1);
  });

  it('右键项目可创建该项目的贴图', () => {
    const onCreateSticker = vi.fn();
    render(
      <ProjectSidebar
        projects={[
          {
            id: 'project-sticker',
            name: '贴图项目',
            color: '#22c55e',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            order: 0,
          },
        ]}
        activeProjectId="project-sticker"
        onSwitch={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
        onReorder={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenHistory={vi.fn()}
        onOpenHelp={vi.fn()}
        onNewTodoInProject={vi.fn()}
        onCreateSticker={onCreateSticker}
        incompleteCounts={{}}
      />,
    );

    fireEvent.contextMenu(screen.getByRole('button', { name: '贴图项目（拖动以排序）' }));
    fireEvent.click(screen.getByRole('button', { name: '创建贴图' }));

    expect(onCreateSticker).toHaveBeenCalledWith('project-sticker');
  });
});
