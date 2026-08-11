/**
 * 项目：新建、重命名、删除、切换、删除最后一个后列表为空、切换后 todo 列表随之切换。
 */
import { test, expect } from '@playwright/test';
import {
  launchApp,
  closeApp,
  addTodo,
  createProject,
  openHistory,
  openProjectContextMenu,
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

test('新建项目并自动切换为当前', async () => {
  await createProject(win, '工作');

  // Header h1 标题变成"工作"
  await expect(win.getByRole('heading', { name: '工作', level: 1 })).toBeVisible();
  // 侧边栏项目按钮里也含"工作"
  await expect(win.getByRole('button', { name: '工作（拖动以排序）' })).toBeVisible();
});

test('新建项目时空标题不创建（Esc 取消）', async () => {
  await win.getByRole('button', { name: '新建项目', exact: true }).click();
  await win.getByPlaceholder('项目名称...').press('Escape');
  // 输入框消失
  await expect(win.getByPlaceholder('项目名称...')).toHaveCount(0);
});

test('重命名项目后新名称生效', async () => {
  await createProject(win, '旧名');

  // 「重命名」入口在项目行的右键菜单（原 hover 按钮已迁移）
  await openProjectContextMenu(win, '旧名');
  await win.getByRole('button', { name: '重命名', exact: true }).click();

  // 编辑态：原 button 被替换为 autoFocus input。编辑 input 是当前 activeElement，
  // 全选后直接输入替换。
  await win.waitForTimeout(300);
  await win.keyboard.press('Control+a');
  await win.keyboard.type('新名');
  await win.keyboard.press('Enter');

  await expect(win.getByRole('button', { name: '新名（拖动以排序）' })).toBeVisible();
  await expect(win.getByRole('button', { name: '旧名（拖动以排序）' })).toHaveCount(0);
});

test('右键项目可快速创建对应贴图', async () => {
  await createProject(win, '贴图项目');

  await openProjectContextMenu(win, '贴图项目');
  const stickerWindow = appInfo.app.waitForEvent('window');
  await win.getByRole('button', { name: '创建贴图', exact: true }).click();

  const sticker = await stickerWindow;
  await sticker.waitForLoadState('domcontentloaded');
  await expect(sticker.getByLabel('选择贴图项目')).toHaveText('贴图项目');
});

test('归档非默认项目：项目消失且历史记录保留项目名称', async () => {
  await createProject(win, '待归档');
  await addTodo(win, '随项目归档的事项');

  await openProjectContextMenu(win, '待归档');
  await win.getByRole('button', { name: '归档项目', exact: true }).click();

  // ConfirmDialog 打开，标题"归档项目"。按 Enter 确认（dialog 监听 Enter）
  await expect(win.getByRole('heading', { name: '归档项目' })).toBeVisible();
  await win.keyboard.press('Enter');

  await expect(win.getByRole('button', { name: '待归档（拖动以排序）' })).toHaveCount(0);

  await openHistory(win);
  await expect(win.getByText('随项目归档的事项', { exact: true })).toBeVisible();
  await expect(win.getByText('待归档', { exact: true })).toBeVisible();
  await expect(win.getByText('已删除的项目', { exact: true })).toHaveCount(0);
});

test('归档最后一个项目后列表为空，主区显示"请创建项目"', async () => {
  await createProject(win, '唯一项目');

  await openProjectContextMenu(win, '唯一项目');
  await win.getByRole('button', { name: '归档项目', exact: true }).click();

  // ConfirmDialog：按 Enter 确认
  await expect(win.getByRole('heading', { name: '归档项目' })).toBeVisible();
  await win.keyboard.press('Enter');

  // 项目列表为空
  await expect(win.getByRole('button', { name: '唯一项目（拖动以排序）' })).toHaveCount(0);
  await expect(win.getByRole('button', { name: /（拖动以排序）/ })).toHaveCount(0);
  // 主区回到无项目引导
  await expect(win.getByRole('heading', { name: '还没有项目' })).toBeVisible();
});

test('切换项目后 todo 列表随之切换', async () => {
  // 建两个项目，各加一条任务
  await createProject(win, '项目一');
  await addTodo(win, '项目一的任务');
  await createProject(win, '项目二');
  await addTodo(win, '项目二的任务');

  // 当前在「项目二」，应能看到项目二的任务，看不到项目一的
  await expect(win.getByText('项目二的任务', { exact: true })).toBeVisible();
  await expect(win.getByText('项目一的任务', { exact: true })).toHaveCount(0);

  // 切到「项目一」
  await win.getByRole('button', { name: '项目一（拖动以排序）' }).click();
  await expect(win.getByText('项目一的任务', { exact: true })).toBeVisible();
  await expect(win.getByText('项目二的任务', { exact: true })).toHaveCount(0);
});

test('切换项目时输入框草稿跟随项目', async () => {
  await createProject(win, '项目一');
  await createProject(win, '项目二');

  const input = win.getByLabel('新事项标题');

  // 当前在「项目二」，输入标题与描述但不提交（仅形成草稿）
  await input.fill('项目二的草稿');
  await win.getByRole('button', { name: '添加描述' }).click();
  await win.getByLabel('新事项描述').fill('项目二的描述草稿');

  // 切到「项目一」→ 标题和描述状态都应为空
  await win.getByRole('button', { name: '项目一（拖动以排序）' }).click();
  await expect(input).toHaveValue('');
  await input.click();
  await expect(win.getByRole('button', { name: '添加描述' })).toBeVisible();
  await expect(win.getByLabel('新事项描述')).toHaveCount(0);

  // 切回「项目二」→ 标题、描述和展开状态都应恢复
  await win.getByRole('button', { name: '项目二（拖动以排序）' }).click();
  await expect(input).toHaveValue('项目二的草稿');
  await input.click();
  await expect(win.getByLabel('新事项描述')).toHaveValue('项目二的描述草稿');
});
