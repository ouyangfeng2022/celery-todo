/**
 * 回收站：删除入站、恢复、永久删除、清空、关闭。
 */
import { test, expect } from '@playwright/test';
import { launchApp, closeApp, addTodo, todoRow, openRecycleBin, type LaunchedApp } from './helpers';

let appInfo: LaunchedApp;
let win: Awaited<ReturnType<typeof launchApp>>['window'];

test.beforeEach(async () => {
  appInfo = await launchApp();
  win = appInfo.window;
});

test.afterEach(async () => {
  await closeApp(appInfo);
});

test('删除 todo 后回收站显示该条 + 项目名标签 + 30 天提示', async () => {
  await addTodo(win, '要回收的任务');
  const row = todoRow(win, '要回收的任务');
  await row.hover();
  await row.getByRole('button', { name: '删除', exact: true }).click();

  await openRecycleBin(win);
  await expect(win.getByText('要回收的任务', { exact: true })).toBeVisible();
  // 项目名标签（"默认项目"）也显示在回收站行
  await expect(win.getByText('默认项目', { exact: true }).first()).toBeVisible();
  // 副标题提示
  await expect(win.getByText('删除的事项会在此保留 30 天')).toBeVisible();
});

test('恢复单条 todo 后回到当前项目列表', async () => {
  await addTodo(win, '待恢复');
  const row = todoRow(win, '待恢复');
  await row.hover();
  await row.getByRole('button', { name: '删除', exact: true }).click();

  await openRecycleBin(win);
  await win.getByRole('button', { name: '恢复' }).click();

  // 关闭回收站（恢复后状态变化，弹窗仍在）
  await win.keyboard.press('Escape');
  // 当前项目列表重新出现该 todo
  await expect(win.getByText('待恢复', { exact: true })).toBeVisible();
});

test('永久删除单条后回收站为空', async () => {
  await addTodo(win, '永久删除这条');
  const row = todoRow(win, '永久删除这条');
  await row.hover();
  await row.getByRole('button', { name: '删除', exact: true }).click();

  await openRecycleBin(win);
  await win.getByRole('button', { name: '永久删除' }).click();
  // 二次确认（ConfirmDialog，confirmText="永久删除"）
  // 弹窗标题"清空回收站"对应清空按钮；单条永久删除若不弹确认，直接消失
  await expect(win.getByText('永久删除这条', { exact: true })).toHaveCount(0);
  await expect(win.getByText('回收站为空')).toBeVisible();
});

test('清空回收站：二次确认后空状态', async () => {
  // 造两条
  for (const t of ['清空A', '清空B']) {
    await addTodo(win, t);
    const row = todoRow(win, t);
    await row.hover();
    await row.getByRole('button', { name: '删除', exact: true }).click();
  }

  await openRecycleBin(win);
  await win.getByRole('button', { name: '清空回收站' }).click();
  // 二次确认 ConfirmDialog：按 Enter 确认（ConfirmDialog 监听 Enter）
  await expect(win.getByRole('heading', { name: '清空回收站' })).toBeVisible();
  await win.keyboard.press('Enter');

  await expect(win.getByText('回收站为空')).toBeVisible();
});

test('Esc 关闭回收站', async () => {
  await openRecycleBin(win);
  await expect(win.getByRole('heading', { name: '回收站' })).toBeVisible();
  await win.keyboard.press('Escape');
  await expect(win.getByRole('heading', { name: '回收站' })).toHaveCount(0);
});
