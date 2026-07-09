/**
 * 项目：新建、重命名、删除、切换、默认项目保护、切换后 todo 列表随之切换。
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

test('新建项目并自动切换为当前', async () => {
  await createProject(win, '工作');

  // Header h1 标题变成"工作"
  await expect(
    win.getByRole('heading', { name: '工作', level: 1 }),
  ).toBeVisible();
  // 侧边栏项目按钮里也含"工作"
  await expect(
    win.getByRole('button', { name: '工作（拖动以排序）' }),
  ).toBeVisible();
});

test('新建项目时空标题不创建（Esc 取消）', async () => {
  await win.getByRole('button', { name: '新建项目' }).click();
  await win.getByPlaceholder('项目名称...').press('Escape');
  // 输入框消失
  await expect(win.getByPlaceholder('项目名称...')).toHaveCount(0);
});

test('重命名项目后新名称生效', async () => {
  await createProject(win, '旧名');
  // 定位项目行（div.group.relative.rounded-md 是 SortableProjectItem 根）
  const projectRow = win
    .locator('div.group.relative.rounded-md')
    .filter({ has: win.getByRole('button', { name: '旧名（拖动以排序）' }) });
  await projectRow.hover();
  await win.waitForTimeout(200);

  // 重命名按钮在 hover 时显示（opacity-0 → 100），force 绕过可见性
  await projectRow.getByRole('button', { name: '重命名', exact: true }).click({ force: true });

  // 编辑态：原 button 被替换为 autoFocus input。编辑 input 是当前 activeElement，
  // 全选后直接输入替换。
  await win.waitForTimeout(300);
  await win.keyboard.press('Control+a');
  await win.keyboard.type('新名');
  await win.keyboard.press('Enter');

  await expect(win.getByRole('button', { name: '新名（拖动以排序）' })).toBeVisible();
  await expect(win.getByRole('button', { name: '旧名（拖动以排序）' })).toHaveCount(0);
});

test('删除非默认项目：二次确认后项目消失', async () => {
  await createProject(win, '待删除');

  const projectRow = win
    .locator('div.group.relative.rounded-md')
    .filter({ has: win.getByRole('button', { name: '待删除（拖动以排序）' }) });
  await projectRow.hover();
  await projectRow.getByRole('button', { name: '删除项目', exact: true }).click({ force: true });

  // ConfirmDialog 打开，标题"删除项目"。按 Enter 确认（dialog 监听 Enter）
  await expect(win.getByRole('heading', { name: '删除项目' })).toBeVisible();
  await win.keyboard.press('Enter');

  await expect(
    win.getByRole('button', { name: '待删除（拖动以排序）' }),
  ).toHaveCount(0);
});

test('默认项目不显示删除按钮（保护）', async () => {
  const projectRow = win
    .locator('div.group.relative.rounded-md')
    .filter({ has: win.getByRole('button', { name: '默认项目（拖动以排序）' }) });
  await projectRow.hover();
  await expect(projectRow.getByRole('button', { name: '删除项目', exact: true })).toHaveCount(0);
});

test('切换项目后 todo 列表随之切换', async () => {
  // 在默认项目里加一条
  await addTodo(win, '默认项目的任务');

  // 新建项目并加一条
  await createProject(win, '切换测试');
  await addTodo(win, '切换测试的任务');

  // 当前在新项目，应能看到新项目任务，看不到默认项目的
  await expect(win.getByText('切换测试的任务', { exact: true })).toBeVisible();
  await expect(win.getByText('默认项目的任务', { exact: true })).toHaveCount(0);

  // 切回默认项目
  await win.getByRole('button', { name: '默认项目（拖动以排序）' }).click();
  await expect(win.getByText('默认项目的任务', { exact: true })).toBeVisible();
  await expect(win.getByText('切换测试的任务', { exact: true })).toHaveCount(0);
});
