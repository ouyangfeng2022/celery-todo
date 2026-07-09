/**
 * 应用启动相关 smoke 测试。
 */
import { test, expect } from '@playwright/test';
import { launchApp, closeApp, type LaunchedApp } from './helpers';

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

test('首次启动自动创建"默认项目"并切为当前', async () => {
  const win = appInfo.window;
  // ProjectSidebar 中默认项目作为按钮，name 含"默认项目（拖动以排序）"
  await expect(
    win.getByRole('button', { name: '默认项目（拖动以排序）' }),
  ).toBeVisible();
  // Header 标题也是它（页面里有两个 level=1 的 heading：侧边栏 logo + Header 项目名）
  const h1s = win.getByRole('heading', { level: 1 });
  const texts = await h1s.allTextContents();
  expect(texts).toContain('默认项目');
});

test('空列表显示 EmptyState 文案', async () => {
  await expect(appInfo.window.getByRole('heading', { name: '从一件小事开始' })).toBeVisible();
});

test('退出专注模式后 Header / 侧边栏 / FilterBar / StatsPanel 均渲染', async () => {
  const win = appInfo.window;
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
  // Header 通知按钮 + 进入专注模式按钮（专注模式已退出）
  await expect(win.getByRole('button', { name: '消息' })).toBeVisible();
  await expect(win.getByRole('button', { name: '进入专注模式' })).toBeVisible();
});
