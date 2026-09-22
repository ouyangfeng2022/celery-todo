/**
 * @file FilterBar 排序下拉交互测试
 * @description 核心交互：再次选择当前排序方式 = 切换正序/倒序；
 *   选择其它方式 = 切换到该方式的倒序默认；manual 状态可正常退出。
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SortType } from '../types';
import { FilterBar } from '../components/filters/FilterBar';

function renderFilterBar(sort: SortType) {
  const onSortChange = vi.fn();
  render(
    <FilterBar
      filter="all"
      sort={sort}
      activeCount={1}
      completedCount={0}
      viewMode="list"
      onFilterChange={vi.fn()}
      onSortChange={onSortChange}
      onClearCompleted={vi.fn()}
      onViewModeChange={vi.fn()}
    />,
  );
  return { onSortChange };
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: /^排序方式/ }));
}

describe('FilterBar 排序下拉', () => {
  it('再次点击当前方式：created-desc → created-asc → created-desc', () => {
    const { onSortChange } = renderFilterBar('created-desc');
    openMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: '创建时间' }));
    expect(onSortChange).toHaveBeenCalledWith('created-asc');
  });

  it('再次点击当前方式：priority-asc → priority-desc', () => {
    const { onSortChange } = renderFilterBar('priority-asc');
    openMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: '优先级' }));
    expect(onSortChange).toHaveBeenCalledWith('priority-desc');
  });

  it('选择其它方式：切换到该方式的倒序默认', () => {
    const { onSortChange } = renderFilterBar('created-asc');
    openMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: '优先级' }));
    expect(onSortChange).toHaveBeenCalledWith('priority-desc');
  });

  it('manual（拖拽自定义顺序）状态下选择方式回到倒序默认', () => {
    const { onSortChange } = renderFilterBar('manual');
    // 按钮展示「自定义顺序」且不可选回 manual 的入口
    expect(screen.getByRole('button', { name: '排序方式：自定义顺序' })).toBeVisible();
    openMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: '创建时间' }));
    expect(onSortChange).toHaveBeenCalledWith('created-desc');
  });

  it('菜单展示当前方式与方向，方式切换后菜单关闭', async () => {
    renderFilterBar('priority-desc');
    openMenu();
    const created = screen.getByRole('menuitemradio', { name: '创建时间' });
    expect(created.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('menuitemradio', { name: '优先级' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    fireEvent.click(created);
    // 切换方式后菜单收起（退场动画经 waitFor 等待）
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  it('点击外部关闭菜单且不触发排序变更', async () => {
    const { onSortChange } = renderFilterBar('created-desc');
    openMenu();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    expect(onSortChange).not.toHaveBeenCalled();
  });
});
