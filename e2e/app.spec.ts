/**
 * 应用启动相关 smoke 测试。
 */
import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createProject, type LaunchedApp } from './helpers';

let appInfo: LaunchedApp;

test.beforeEach(async () => {
  appInfo = await launchApp();
});

test.afterEach(async () => {
  await closeApp(appInfo);
  appInfo = undefined as unknown as LaunchedApp;
});

test('窗口标题为 Celery Todo', async () => {
  await expect(appInfo.window).toHaveTitle(/Celery Todo/);
});

test('首屏渲染应用名（侧边栏 logo 区）', async () => {
  // 侧边栏 logo 区有 <h1>Celery Todo</h1>
  await expect(
    appInfo.window.getByRole('heading', { name: 'Celery Todo', level: 1 }).first(),
  ).toBeVisible();
});

test('首次启动项目列表为空，主区显示"请创建项目"引导', async () => {
  const win = appInfo.window;
  // 不再自动创建默认项目：侧边栏无项目按钮
  await expect(win.getByRole('button', { name: /（拖动以排序）/ })).toHaveCount(0);
  // 主区显示「请创建项目」引导
  await expect(win.getByRole('heading', { name: '还没有项目' })).toBeVisible();
  // Header 标题降级为应用名（无激活项目）
  const h1s = win.getByRole('heading', { level: 1 });
  const texts = await h1s.allTextContents();
  expect(texts).toContain('Celery Todo');
});

test('创建项目后 EmptyState（无待办）引导显示', async () => {
  const win = appInfo.window;
  // 首启无项目 → 建第一个项目后，项目为空，todo 列表显示 EmptyState
  await createProject(win, '第一个项目');
  // 建项目后自动切换，主区从「请创建项目」变为正常视图，无 todo 时显示 EmptyState
  await expect(win.getByRole('heading', { name: '从一件小事开始' })).toBeVisible({ timeout: 5_000 });
});

test('退出专注模式后 Header / 侧边栏 / FilterBar / StatsPanel 均渲染', async () => {
  const win = appInfo.window;
  // 首启无项目时主区只显示 NoProjectsState，FilterBar/StatsPanel 不渲染；
  // 先建一个项目，才能验证正常视图的各组件
  await createProject(win, '渲染检查项目');
  // FilterBar 三个过滤按钮：name 形如 "全部 0" / "进行中 0" / "已完成 0"
  await expect(win.getByRole('button', { name: /全部/ })).toBeVisible();
  await expect(win.getByRole('button', { name: /进行中/ })).toBeVisible();
  await expect(win.getByRole('button', { name: /已完成/ })).toBeVisible();
  // 排序下拉
  await expect(win.getByLabel('排序方式')).toBeVisible();
  // 添加事项输入框
  await expect(
    win.getByPlaceholder('添加待办事项...（按 Shift+Enter 换行可批量添加）'),
  ).toBeVisible();
  // 进入专注模式按钮（专注模式已退出）
  await expect(win.getByRole('button', { name: '进入专注模式' })).toBeVisible();
});
