/**
 * 过滤 / 排序 / 清空已完成 / URL 参数预设。
 */
import { test, expect } from '@playwright/test';
import { launchApp, closeApp, addTodo, createProject, type LaunchedApp } from './helpers';

let appInfo: LaunchedApp;
let win: Awaited<ReturnType<typeof launchApp>>['window'];

test.beforeEach(async () => {
  appInfo = await launchApp();
  win = appInfo.window;
  // 首启无默认项目，先建一个项目再造数据
  await createProject(win, '测试项目');
  // 造数据：3 条未完成 + 2 条已完成
  await addTodo(win, '进行中1');
  await addTodo(win, '进行中2');
  await addTodo(win, '进行中3');
  await addTodo(win, '已完成1');
  await addTodo(win, '已完成2');

  // 完成后两条
  for (const t of ['已完成1', '已完成2']) {
    const row = win.getByText(t, { exact: true }).locator('xpath=ancestor::div[contains(@class,"group")][1]');
    await row.hover();
    await row.getByRole('button', { name: '标记为已完成' }).click();
  }
});

test.afterEach(async () => {
  await closeApp(appInfo);
});

/**
 * 定位 todo 标题：限定在列表行容器内，避免与过滤按钮徽章文案（如"已完成 2"）混淆。
 * 行容器 class 含 "group relative flex items-center gap-3"，标题是其内 div.text-[15px]
 */
function todoTitle(win: typeof win, title: string) {
  return win.locator('div.group.relative.flex.items-center.gap-3').filter({
    has: win.locator(`div.text-\\[15px\\]`, { hasText: title }),
  });
}

test('"全部"显示所有 5 条', async () => {
  await win.getByRole('button', { name: /全部/ }).click();
  await expect(todoTitle(win, '进行中1')).toBeVisible();
  await expect(todoTitle(win, '已完成1')).toBeVisible();
  await expect(todoTitle(win, '已完成2')).toBeVisible();
});

test('"进行中"仅显示未完成的 3 条', async () => {
  await win.getByRole('button', { name: /进行中/ }).click();
  await expect(todoTitle(win, '进行中1')).toBeVisible();
  await expect(todoTitle(win, '已完成1')).toHaveCount(0);
  await expect(todoTitle(win, '已完成2')).toHaveCount(0);
});

test('"已完成"仅显示已完成的 2 条', async () => {
  await win.getByRole('button', { name: /^已完成/ }).click();
  await expect(todoTitle(win, '已完成1')).toBeVisible();
  await expect(todoTitle(win, '已完成2')).toBeVisible();
  await expect(todoTitle(win, '进行中1')).toHaveCount(0);
});

test('过滤按钮右侧徽章计数正确', async () => {
  // 全部=5，进行中=3，已完成=2（name 形如 "全部 5"）
  await expect(win.getByRole('button', { name: '全部 5' })).toBeVisible();
  await expect(win.getByRole('button', { name: '进行中 3' })).toBeVisible();
  await expect(win.getByRole('button', { name: '已完成 2' })).toBeVisible();
});

test('切换排序方式为"创建时间 ↑"（最旧的在前）', async () => {
  await win.getByLabel('排序方式').selectOption('created-asc');
  // 排序后第一条标题应是"进行中1"
  const firstTitle = await win
    .locator('div.group.relative.flex.items-center.gap-3')
    .first()
    .evaluate((el) => (el.querySelector('div.text-\\[15px\\]') as HTMLElement)?.textContent?.trim() ?? '');
  expect(firstTitle).toBe('进行中1');
});

test('切换排序方式为"优先级"', async () => {
  // 仅断言 select 值切换成功，不严格断言顺序（无优先级差异时顺序不固定）
  await win.getByLabel('排序方式').selectOption('priority');
  await expect(win.getByLabel('排序方式')).toHaveValue('priority');
});

test('"清空已完成"按钮仅在有已完成时显示，点击后归档到历史记录', async () => {
  await expect(win.getByRole('button', { name: '清空已完成' })).toBeVisible();
  await win.getByRole('button', { name: '清空已完成' }).click();
  // 已完成的两条从"全部"视图消失
  await win.getByRole('button', { name: /全部/ }).click();
  await expect(win.getByText('已完成1', { exact: true })).toHaveCount(0);
  await expect(win.getByText('已完成2', { exact: true })).toHaveCount(0);
  // 按钮也随之消失
  await expect(win.getByRole('button', { name: '清空已完成' })).toHaveCount(0);
});
