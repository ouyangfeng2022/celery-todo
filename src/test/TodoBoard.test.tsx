import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Todo } from '../types';
import { TodoBoard } from '../components/todos/TodoBoard';

function todo(id: string, title: string, plannedDate?: string): Todo {
  return {
    id,
    projectId: 'project-1',
    title,
    completed: false,
    priority: 'medium',
    plannedDate,
    createdAt: '2026-08-10T08:00:00.000Z',
    updatedAt: '2026-08-10T08:00:00.000Z',
    order: Number(id),
    pinned: false,
  };
}

describe('TodoBoard', () => {
  it('按日期升序分组，并将未安排事项放在最后', () => {
    render(
      <TodoBoard
        todos={[
          todo('3', '未安排事项'),
          todo('2', '周二事项', '2030-01-08'),
          todo('1', '周一事项', '2030-01-07'),
        ]}
        selectedIds={new Set()}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleSelect={vi.fn()}
      />,
    );

    expect(
      screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent),
    ).toEqual(['周一', '周二', '未安排']);
    expect(within(screen.getByLabelText('周一，1 条事项')).getByText('周一事项')).toBeVisible();
    expect(within(screen.getByLabelText('未安排，1 条事项')).getByText('未安排事项')).toBeVisible();
  });

  it('卡片保留完成与多选操作，但不显示拖拽手柄', () => {
    const onToggle = vi.fn();
    const onToggleSelect = vi.fn();
    render(
      <TodoBoard
        todos={[todo('1', '周一事项', '2030-01-07')]}
        selectedIds={new Set()}
        onToggle={onToggle}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleSelect={onToggleSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '标记为已完成' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '选择事项' }));
    expect(onToggle).toHaveBeenCalledWith('1');
    expect(onToggleSelect).toHaveBeenCalledWith('1');
    expect(screen.queryByRole('button', { name: '拖拽排序' })).not.toBeInTheDocument();
  });
});
