import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExportImageCard } from '@/components/export/ExportImageCard';
import type { Project, Todo } from '@/types';

vi.mock('@/utils/sortTodos', () => ({
  readProjectSort: () => 'created-desc',
  sortTodos: (items: Todo[]) => items,
}));

const project: Project = {
  id: 'project-1',
  name: '预览项目',
  kind: 'user',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  order: 0,
};

const todos: Todo[] = Array.from({ length: 8 }, (_, index) => ({
  id: `todo-${index}`,
  projectId: project.id,
  title: `事项 ${index + 1}`,
  description: '',
  completed: false,
  priority: 'medium',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  order: index,
  pinned: false,
}));

describe('ExportImageCard', () => {
  it('预览模式仅渲染指定数量的事项，并说明省略数量', () => {
    render(<ExportImageCard project={project} todos={todos} filter="all" maxItems={3} />);

    expect(screen.getByText('事项 3')).toBeInTheDocument();
    expect(screen.queryByText('事项 4')).not.toBeInTheDocument();
    expect(screen.getByText(/预览省略其余 5 项/)).toBeInTheDocument();
  });

  it('完整导出模式不省略事项', () => {
    render(<ExportImageCard project={project} todos={todos} filter="all" />);

    expect(screen.getByText('事项 8')).toBeInTheDocument();
    expect(screen.queryByText(/预览省略/)).not.toBeInTheDocument();
  });

  it('底部署名包含 GitHub 链接与仓库二维码', () => {
    render(<ExportImageCard project={project} todos={todos} filter="all" />);

    expect(screen.getByText('github.com/ouyangfeng2022/celery-todo')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'GitHub 仓库二维码' })).toBeInTheDocument();
  });

  it('showBranding=false 时底部署名不显示链接与二维码，保留品牌与日期', () => {
    render(
      <ExportImageCard project={project} todos={todos} filter="all" showBranding={false} />,
    );

    expect(screen.queryByText('github.com/ouyangfeng2022/celery-todo')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'GitHub 仓库二维码' })).not.toBeInTheDocument();
    expect(screen.getByText('Celery Todo')).toBeInTheDocument();
  });
});
