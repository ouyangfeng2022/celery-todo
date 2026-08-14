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
  it('时间模式显示互斥分类数量并可切换分类', () => {
    const onTimeBucketChange = vi.fn();
    render(
      <ProjectSidebar
        projects={[]}
        activeProjectId=""
        onSwitch={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onPermanentDelete={vi.fn()}
        onOpenExport={vi.fn()}
        onReorder={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenHistory={vi.fn()}
        onOpenStats={vi.fn()}
        onOpenHelp={vi.fn()}
        onNewTodoInProject={vi.fn()}
        onCreateSticker={vi.fn()}
        onImport={vi.fn()}
        incompleteCounts={{}}
        navigationMode="time"
        timeBucket="today"
        timeCounts={{ replan: 2, today: 3, tomorrow: 1, week: 0, later: 0, unscheduled: 4 }}
        onTimeBucketChange={onTimeBucketChange}
      />,
    );

    expect(screen.getByRole('button', { name: '待重新安排 2' })).toBeVisible();
    expect(screen.getByRole('button', { name: '今天 3' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '明天 1' }));
    expect(onTimeBucketChange).toHaveBeenCalledWith('tomorrow');
    expect(screen.getByRole('button', { name: '本周' })).toBeVisible();
  });

  it('旧版本周项目在项目列表中显示独立标识', () => {
    render(
      <ProjectSidebar
        projects={[
          {
            id: 'weekly-2026-W33-project',
            name: '2026 年第 33 周待办',
            kind: 'weekly',
            createdAt: '2026-08-10T00:00:00.000Z',
            updatedAt: '2026-08-10T00:00:00.000Z',
            order: 1024,
          },
        ]}
        activeProjectId=""
        onSwitch={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onPermanentDelete={vi.fn()}
        onOpenExport={vi.fn()}
        onReorder={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenHistory={vi.fn()}
        onOpenStats={vi.fn()}
        onOpenHelp={vi.fn()}
        onNewTodoInProject={vi.fn()}
        onCreateSticker={vi.fn()}
        onImport={vi.fn()}
        incompleteCounts={{}}
      />,
    );

    expect(screen.getByText('自动')).toBeVisible();
    expect(screen.getByRole('button', { name: '2026 年第 33 周待办（拖动以排序）' })).toBeVisible();
  });

  it('可以隐藏旧版本周项目，并从项目列表中直接恢复显示', () => {
    const onToggleWeeklyProjects = vi.fn();
    render(
      <ProjectSidebar
        projects={[
          {
            id: 'user-project',
            name: '手动项目',
            kind: 'user',
            createdAt: '2026-08-10T00:00:00.000Z',
            updatedAt: '2026-08-10T00:00:00.000Z',
            order: 1024,
          },
          {
            id: 'weekly-2026-W33-project',
            name: '2026 年第 33 周待办',
            kind: 'weekly',
            createdAt: '2026-08-10T00:00:00.000Z',
            updatedAt: '2026-08-10T00:00:00.000Z',
            order: 2048,
          },
        ]}
        activeProjectId="user-project"
        onSwitch={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onPermanentDelete={vi.fn()}
        onOpenExport={vi.fn()}
        onReorder={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenHistory={vi.fn()}
        onOpenStats={vi.fn()}
        onOpenHelp={vi.fn()}
        onNewTodoInProject={vi.fn()}
        onCreateSticker={vi.fn()}
        onImport={vi.fn()}
        incompleteCounts={{}}
        showWeeklyProjects={false}
        onToggleWeeklyProjects={onToggleWeeklyProjects}
      />,
    );

    expect(screen.getByText('手动项目')).toBeVisible();
    expect(screen.queryByText('2026 年第 33 周待办')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示自动创建项目' }));
    expect(onToggleWeeklyProjects).toHaveBeenCalledOnce();
  });

  it('收集箱固定项目只能添加和导出，受保护操作保持禁用', () => {
    const onOpenExport = vi.fn();
    render(
      <ProjectSidebar
        projects={[
          {
            id: 'inbox',
            name: '收集箱',
            kind: 'inbox',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            order: 0,
          },
        ]}
        activeProjectId="inbox"
        onSwitch={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onPermanentDelete={vi.fn()}
        onOpenExport={onOpenExport}
        onReorder={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenHistory={vi.fn()}
        onOpenStats={vi.fn()}
        onOpenHelp={vi.fn()}
        onNewTodoInProject={vi.fn()}
        onCreateSticker={vi.fn()}
        onImport={vi.fn()}
        incompleteCounts={{ inbox: 1 }}
      />,
    );

    fireEvent.contextMenu(screen.getByRole('button', { name: /^收集箱$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^导出…$/ }));
    expect(onOpenExport).toHaveBeenCalledWith('inbox');

    fireEvent.contextMenu(screen.getByRole('button', { name: /^收集箱$/ }));
    expect(screen.getByRole('button', { name: '保存为模板' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '重命名' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '归档项目' })).toBeDisabled();
  });

  it('左下角菜单包含「设置」「已归档事项」「帮助与反馈」', () => {
    const onOpenSettings = vi.fn();
    const onOpenHistory = vi.fn();
    const onOpenStats = vi.fn();
    const onOpenHelp = vi.fn();
    render(
      <ProjectSidebar
        projects={[]}
        activeProjectId=""
        onSwitch={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onPermanentDelete={vi.fn()}
        onOpenExport={vi.fn()}
        onReorder={vi.fn()}
        onOpenSettings={onOpenSettings}
        onOpenHistory={onOpenHistory}
        onOpenStats={onOpenStats}
        onOpenHelp={onOpenHelp}
        onNewTodoInProject={vi.fn()}
        onCreateSticker={vi.fn()}
        onImport={vi.fn()}
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
            kind: 'user',
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
        onPermanentDelete={vi.fn()}
        onOpenExport={vi.fn()}
        onReorder={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenHistory={vi.fn()}
        onOpenStats={vi.fn()}
        onOpenHelp={vi.fn()}
        onNewTodoInProject={vi.fn()}
        onCreateSticker={onCreateSticker}
        onImport={vi.fn()}
        incompleteCounts={{}}
      />,
    );

    fireEvent.contextMenu(screen.getByRole('button', { name: '贴图项目（拖动以排序）' }));
    fireEvent.click(screen.getByRole('button', { name: '创建贴图' }));

    expect(onCreateSticker).toHaveBeenCalledWith('project-sticker');
  });

  it('在项目行右键可一步新建项目', () => {
    const onCreate = vi.fn();
    render(
      <ProjectSidebar
        projects={[
          {
            id: 'p1',
            name: '项目一',
            kind: 'user',
            color: '#22c55e',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            order: 0,
          },
        ]}
        activeProjectId="p1"
        onSwitch={vi.fn()}
        onCreate={onCreate}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onPermanentDelete={vi.fn()}
        onOpenExport={vi.fn()}
        onReorder={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenHistory={vi.fn()}
        onOpenStats={vi.fn()}
        onOpenHelp={vi.fn()}
        onNewTodoInProject={vi.fn()}
        onCreateSticker={vi.fn()}
        onImport={vi.fn()}
        incompleteCounts={{}}
      />,
    );

    // 右键项目行 → 菜单顶部「新建项目」 → 输入名称回车。
    // 注意「新建项目」会同时命中菜单项与侧栏「+」按钮（aria-label），取 portal 中渲染的最后一个。
    fireEvent.contextMenu(screen.getByRole('button', { name: '项目一（拖动以排序）' }));
    const newProjectBtns = screen.getAllByRole('button', { name: '新建项目' });
    fireEvent.click(newProjectBtns[newProjectBtns.length - 1]);
    const input = screen.getByPlaceholderText('项目名称...');
    fireEvent.change(input, { target: { value: '新项目' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCreate).toHaveBeenCalledWith('新项目');
  });

  it('列表空白处右键提供新建项目/导入/导出', () => {
    const onCreate = vi.fn();
    const onImport = vi.fn();
    const onOpenExport = vi.fn();
    render(
      <ProjectSidebar
        projects={[
          {
            id: 'p1',
            name: '项目一',
            kind: 'user',
            color: '#22c55e',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            order: 0,
          },
        ]}
        activeProjectId="p1"
        onSwitch={vi.fn()}
        onCreate={onCreate}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onPermanentDelete={vi.fn()}
        onOpenExport={onOpenExport}
        onReorder={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenHistory={vi.fn()}
        onOpenStats={vi.fn()}
        onOpenHelp={vi.fn()}
        onNewTodoInProject={vi.fn()}
        onCreateSticker={vi.fn()}
        onImport={onImport}
        incompleteCounts={{}}
      />,
    );

    // 在项目列表的空白处（列表容器内、非项目行）右键。
    // 列表容器的 onContextMenu 挂在 aside 内 overflow-auto 的 div 上，
    // 事件冒泡而非捕获，故在「项目」分组标题上触发即可命中它。
    const sectionHeader = screen.getByText('项目', { selector: 'span.text-sm' });

    fireEvent.contextMenu(sectionHeader);

    // 空白菜单不包含项目级操作
    expect(screen.queryByRole('button', { name: '归档项目' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重命名' })).not.toBeInTheDocument();

    // 但包含这 3 项
    fireEvent.click(screen.getByRole('button', { name: '导入数据' }));
    expect(onImport).toHaveBeenCalledTimes(1);

    // 重新唤出菜单（点击项后菜单关闭）
    fireEvent.contextMenu(sectionHeader);
    fireEvent.click(screen.getByRole('button', { name: '导出数据…' }));
    expect(onOpenExport).toHaveBeenCalledTimes(1);

    // 新建项目走同一输入流程
    fireEvent.contextMenu(sectionHeader);
    const newProjectBtns = screen.getAllByRole('button', { name: '新建项目' });
    fireEvent.click(newProjectBtns[newProjectBtns.length - 1]);
    const input = screen.getByPlaceholderText('项目名称...');
    fireEvent.change(input, { target: { value: '空白创建' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCreate).toHaveBeenCalledWith('空白创建');
  });
});
