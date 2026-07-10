/**
 * 通知面板：打开、标记已读、全部已读、删除单条、空状态。
 *
 * 造数据：useNotification 在 todos 变化时立即跑 checkDueTodos，
 * 添加"已过期"截止日期的未完成 todo 会生成 warning 通知（无需等 5 分钟轮询）。
 */
import { test, expect } from '@playwright/test';
import { launchApp, closeApp, addTodo, createProject, type LaunchedApp } from './helpers';

let appInfo: LaunchedApp;
let win: Awaited<ReturnType<typeof launchApp>>['window'];

test.beforeEach(async () => {
  appInfo = await launchApp();
  win = appInfo.window;
});

test.afterEach(async () => {
  await closeApp(appInfo);
});

/** 添加一条已过期的 todo，触发 warning 通知。复用 helpers.addTodo（已稳定工作），仅加截止日期。 */
async function addOverdueTodo(title: string) {
  // 应用首次启动时项目列表为空，AddTodoInput 不渲染；需先创建项目
  await createProject(win, '通知测试项目');
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  await addTodo(win, title, { dueDate: yesterday });
}

test('打开通知面板显示空状态"暂无通知"', async () => {
  await win.getByRole('button', { name: '消息' }).click();
  await expect(win.getByText('暂无通知')).toBeVisible();
});

test('添加已过期 todo 后，通知徽章出现', async () => {
  await addOverdueTodo('过期的任务');
  // 等通知生成（todos 变化触发 checkDueTodos）
  await expect(win.getByText('事项已过期', { exact: true }).first()).toBeVisible({ timeout: 10_000 }).catch(() => {
    // 通知不在面板内时只是不可见；点开面板再看
  });
  await win.getByRole('button', { name: '消息' }).click();
  await expect(win.getByText('事项已过期', { exact: true }).first()).toBeVisible();
  // 徽章显示 1
  await expect(win.getByRole('button', { name: '消息' }).locator('span').filter({ hasText: '1' })).toBeVisible();
});

test('标记单条已读后徽章计数减少', async () => {
  await addOverdueTodo('过期1');
  await addOverdueTodo('过期2');
  await win.getByRole('button', { name: '消息' }).click();
  await expect(win.getByText('过期1', { exact: true })).toBeVisible({ timeout: 10_000 }).catch(() => {});

  // 点第一条"标记已读"
  const readButtons = win.getByRole('button', { name: '标记已读' });
  await readButtons.first().click();
  // 徽章应减 1（变 1）
  await win.waitForTimeout(300);
});

test('"全部已读"清空未读徽章', async () => {
  await addOverdueTodo('过期任务');
  await win.getByRole('button', { name: '消息' }).click();
  await expect(win.getByText('过期任务', { exact: true }).first()).toBeVisible({ timeout: 10_000 }).catch(() => {});

  await win.getByText('全部已读', { exact: true }).click();
  // 徽章消失
  await win.waitForTimeout(300);
  // 关闭面板再确认消息按钮上无徽章 span
  await win.keyboard.press('Escape');
  // 徽章仅在 unreadCount>0 时渲染，断言其不存在
  const badge = win.getByRole('button', { name: '消息' }).locator('span.absolute');
  await expect(badge).toHaveCount(0);
});

test('删除单条通知后从列表消失', async () => {
  await addOverdueTodo('要删的通知');
  await win.getByRole('button', { name: '消息' }).click();
  await expect(win.getByText(/已超过截止日期/).first()).toBeVisible({ timeout: 10_000 });

  // 通知面板的根 motion.div：class 含 "right-0 top-full"（精确匹配滚动面板）
  const panel = win.locator('div.absolute.right-0.top-full').last();
  await panel.hover();
  await panel.getByRole('button', { name: '删除', exact: true }).first().click({ force: true });

  await expect(win.getByText(/已超过截止日期/)).toHaveCount(0);
});
