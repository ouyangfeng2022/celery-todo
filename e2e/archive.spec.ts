/**
 * 历史记录（归档）：删除入档、在设置的历史记录 Tab 查看、恢复、永久删除、清空、关闭。
 *
 * 归档取代了原回收站：删除的事项不再 30 天自动清除，而是永久归档，
 * 仅在「设置 → 历史记录」中可恢复或永久删除。
 */
import { test, expect } from '@playwright/test';
import {
  launchApp,
  closeApp,
  addTodo,
  createProject,
  todoRow,
  openHistory,
  type LaunchedApp,
} from './helpers';

let appInfo: LaunchedApp;
let win: Awaited<ReturnType<typeof launchApp>>['window'];

test.beforeEach(async () => {
  appInfo = await launchApp();
  win = appInfo.window;
});

test.afterEach(async () => {
  await closeApp(appInfo);
});

test('删除 todo 后历史记录显示该条 + 项目名标签', async () => {
  await createProject(win, '归档测试项目');
  await addTodo(win, '要归档的任务');
  const row = todoRow(win, '要归档的任务');
  await row.hover();
  await row.getByRole('button', { name: '删除', exact: true }).click();

  await openHistory(win);
  await expect(win.getByText('要归档的任务', { exact: true })).toBeVisible();
  // 项目名标签显示在历史记录行
  await expect(win.getByText('归档测试项目', { exact: true }).first()).toBeVisible();
  // 副标题提示（归档语义，无 30 天字样）
  await expect(
    win.getByText('删除的事项会归档到此处，可在任意时间恢复或永久删除。'),
  ).toBeVisible();
});

test('恢复单条 todo 后回到当前项目列表', async () => {
  await createProject(win, '日常事务');
  await addTodo(win, '待恢复');
  const row = todoRow(win, '待恢复');
  await row.hover();
  await row.getByRole('button', { name: '删除', exact: true }).click();

  await openHistory(win);
  await win.getByRole('button', { name: '恢复' }).click();

  // 关闭设置面板（Esc），回到项目列表
  await win.keyboard.press('Escape');
  // 当前项目列表重新出现该 todo
  await expect(win.getByText('待恢复', { exact: true })).toBeVisible();
});

test('永久删除单条后历史记录为空', async () => {
  await createProject(win, '清理工作');
  await addTodo(win, '永久删除这条');
  const row = todoRow(win, '永久删除这条');
  await row.hover();
  await row.getByRole('button', { name: '删除', exact: true }).click();

  await openHistory(win);
  // 行内悬浮「永久删除」按钮：先 hover 行再点
  const archivedRow = win.locator('div.group', { hasText: '永久删除这条' }).first();
  await archivedRow.hover();
  await archivedRow.getByRole('button', { name: '永久删除' }).click();
  await expect(win.getByText('永久删除这条', { exact: true })).toHaveCount(0);
  await expect(win.getByText('暂无历史记录')).toBeVisible();
});

test('清空归档：二次确认后空状态', async () => {
  await createProject(win, '归档列表');
  // 造两条归档
  for (const t of ['清空A', '清空B']) {
    await addTodo(win, t);
    const row = todoRow(win, t);
    await row.hover();
    await row.getByRole('button', { name: '删除', exact: true }).click();
  }

  await openHistory(win);
  await win.getByRole('button', { name: '清空归档' }).click();
  // 二次确认 ConfirmDialog：按 Enter 确认（ConfirmDialog 监听 Enter）
  await expect(win.getByRole('heading', { name: '清空归档' })).toBeVisible();
  await win.keyboard.press('Enter');

  await expect(win.getByText('暂无历史记录')).toBeVisible();
});

test('Esc 关闭设置（含历史记录 Tab）', async () => {
  await openHistory(win);
  await expect(win.getByRole('heading', { name: '设置' })).toBeVisible();
  await win.keyboard.press('Escape');
  await expect(win.getByRole('heading', { name: '设置' })).toHaveCount(0);
});
