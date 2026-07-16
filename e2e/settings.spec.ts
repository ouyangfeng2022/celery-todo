/**
 * 设置：主题、专注模式、数据管理重置。
 */
import { test, expect } from '@playwright/test';
import { launchApp, closeApp, addTodo, createProject, openSettings, type LaunchedApp } from './helpers';

let appInfo: LaunchedApp;
let win: Awaited<ReturnType<typeof launchApp>>['window'];

test.beforeEach(async () => {
  appInfo = await launchApp();
  win = appInfo.window;
});

test.afterEach(async () => {
  await closeApp(appInfo);
});

test('打开设置面板，标题可见', async () => {
  await openSettings(win);
  await expect(win.getByRole('heading', { name: '设置' })).toBeVisible();
});

test('切换主题为"深色"，document.documentElement.dark 生效', async () => {
  await openSettings(win);
  await win.getByText('深色', { exact: true }).click();
  // useTheme 把 .dark class 加到 html
  await expect(win.locator('html')).toHaveClass(/dark/);
});

test('切换主题为"浅色"，移除 dark class', async () => {
  await openSettings(win);
  await win.getByText('浅色', { exact: true }).click();
  await expect(win.locator('html')).not.toHaveClass(/dark/);
});

test('勾选专注模式 checkbox，侧边栏立即隐藏', async () => {
  await openSettings(win);
  // launchApp 已退出专注模式（focusMode=false），checkbox 未勾选
  const focusLabel = win.locator('label', { hasText: '专注模式' }).first();
  const checkbox = focusLabel.locator('input[type="checkbox"]');
  await expect(checkbox).not.toBeChecked();

  // 勾选 → focusMode=true → 侧边栏不渲染
  await checkbox.check();
  await expect(win.getByRole('complementary')).toHaveCount(0);
  // 设置面板本身仍可见（专注模式只隐藏主视图 chrome，不关设置）
  await expect(win.getByRole('heading', { name: '设置' })).toBeVisible();
});

test('重置所有数据：二次确认后数据清空且项目列表为空', async () => {
  // 首启无项目，先建一个再加任务
  await createProject(win, '数据项目');
  await addTodo(win, '重置前任务');
  await expect(win.getByText('重置前任务', { exact: true })).toBeVisible();

  await openSettings(win);
  await win.getByText('重置所有数据', { exact: true }).click();
  // 确认对话框：按 Enter 确认（ConfirmDialog 监听 Enter）
  await expect(win.getByRole('heading', { name: '重置所有数据' })).toBeVisible();
  await win.keyboard.press('Enter');

  // 设置面板关闭（handleResetData 里 setSettingsOpen(false)）
  await expect(win.getByRole('heading', { name: '设置' })).toHaveCount(0);
  // 数据清空：任务消失
  await expect(win.getByText('重置前任务', { exact: true })).toHaveCount(0);
  // 重置后项目列表为空，主区显示无项目引导（不再自动重建默认项目）
  await expect(win.getByRole('button', { name: '数据项目（拖动以排序）' })).toHaveCount(0);
  await expect(win.getByRole('heading', { name: '还没有项目' })).toBeVisible();
});

test('Esc 关闭设置面板', async () => {
  await openSettings(win);
  await win.keyboard.press('Escape');
  await expect(win.getByRole('heading', { name: '设置' })).toHaveCount(0);
});
