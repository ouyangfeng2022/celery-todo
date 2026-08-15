/**
 * 中等规模列表渐进挂载：切换筛选时只创建首批行，接近底部后继续追加。
 */
import { expect, test } from '@playwright/test';
import { closeApp, createProject, launchApp, type LaunchedApp } from './helpers';

let appInfo: LaunchedApp;

test.afterEach(async () => closeApp(appInfo));

test('60 条已完成事项按滚动位置分批挂载', async () => {
  appInfo = await launchApp();
  const win = appInfo.window;
  await createProject(win, '渐进列表测试项目');

  const input = win.getByLabel('新事项标题');
  const titles = Array.from({ length: 65 }, (_, index) => `渐进事项 ${index + 1}`);
  await input.fill(titles.join('\n'));
  await win.keyboard.press('Enter');
  await expect(win.getByRole('button', { name: '全部 65', exact: true })).toBeVisible();

  // 通过真实受限数据网关批量准备 60/5 状态，避免逐行点击掩盖列表挂载行为。
  const projectId = (
    (await win.evaluate(() => window.electronAPI!.dataQuery('projects'))) as Array<{
      id: string;
      name: string;
    }>
  ).find((project) => project.name === '渐进列表测试项目')!.id;
  const rows = (await win.evaluate(
    (id) => window.electronAPI!.dataQuery('todosByProject', { projectId: id }),
    projectId,
  )) as Array<Record<string, unknown>>;
  const now = new Date().toISOString();
  await win.evaluate(
    ({ todos, completedAt }) =>
      window.electronAPI!.dataCommand('updateTodos', {
        todos: todos.map((row, index) => ({
          id: row.id,
          projectId: row.project_id,
          title: row.title,
          description: row.description ?? undefined,
          completed: index < 60,
          priority: row.priority,
          createdAt: row.created_at,
          updatedAt: completedAt,
          completedAt: index < 60 ? completedAt : undefined,
          order: row.sort_order,
          pinned: Boolean(row.pinned),
          plannedDate: row.planned_date ?? undefined,
        })),
      }),
    { todos: rows, completedAt: now },
  );
  await win.reload();
  await win.locator('main').waitFor();

  await win.getByRole('button', { name: '已完成 60', exact: true }).click();
  const list = win.getByLabel('待办事项列表');
  const mountedRows = list.locator(':scope > div[id^="todo-"]');
  await expect(mountedRows).toHaveCount(15);
  await expect(list.locator('[data-remaining-todos="45"]')).toBeAttached();

  await win.locator('main').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => mountedRows.count()).toBeGreaterThan(15);
});
