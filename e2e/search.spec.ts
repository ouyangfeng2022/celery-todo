/**
 * 搜索：过滤、清除按钮、Ctrl+F 聚焦、URL 同步。
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
  await addTodo(win, '买苹果');
  await addTodo(win, '买香蕉');
  await addTodo(win, '写报告');
});

test.afterEach(async () => {
  await closeApp(appInfo);
});

async function openSearch() {
  await win.getByRole('button', { name: '搜索事项' }).click();
  return win.getByPlaceholder('搜索事项...');
}

test('输入关键词后只显示匹配项', async () => {
  const search = await openSearch();
  await search.fill('苹果');
  await expect(win.getByText('买苹果', { exact: true })).toBeVisible();
  await expect(win.getByText('买香蕉', { exact: true })).toHaveCount(0);
  await expect(win.getByText('写报告', { exact: true })).toHaveCount(0);
});

test('清除按钮清空搜索', async () => {
  const search = await openSearch();
  await search.fill('苹果');
  await win.getByRole('button', { name: '清除搜索' }).click();
  await expect(search).toHaveValue('');
  // 清空后所有 todo 恢复显示
  await expect(win.getByText('买香蕉', { exact: true })).toBeVisible();
});

test('Ctrl+F 聚焦搜索框', async () => {
  await win.keyboard.press('Control+f');
  // 搜索框应成为 activeElement
  const isFocused = await win.evaluate(() => {
    const el = document.activeElement;
    return el?.getAttribute('placeholder') === '搜索事项...';
  });
  expect(isFocused).toBe(true);
});

test('搜索状态同步到 URL ?q=', async () => {
  const search = await openSearch();
  await search.fill('苹果');
  // useFilter 在 effect 里把 search 写入 URL
  await win.waitForTimeout(300);
  expect(win.url()).toContain('q=');
});
