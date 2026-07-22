import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarUpdateCard } from '@/components/projects/ProjectSidebar';

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
