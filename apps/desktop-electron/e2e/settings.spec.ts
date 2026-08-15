/**
 * 设置：主题和数据管理重置。
 */
import { test, expect } from '@playwright/test';
import {
  launchApp,
  closeApp,
  addTodo,
  addTodosBulk,
  createProject,
  todoRow,
  openSettings,
  openSettingsSection,
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

test('打开设置面板，标题可见', async () => {
  await openSettings(win);
  // 设置页根 section 带 aria-label="设置"，是稳定锚点；
  // 进入后默认在「通用」分区，顶部 h1 显示「通用」（activeNavItem.label）。
  await expect(win.getByRole('region', { name: '设置' })).toBeVisible();
  await expect(win.getByRole('heading', { name: '通用' })).toBeVisible();
});

test('切换默认深色主题，document.documentElement.dark 生效', async () => {
  await openSettings(win);
  await win
    .getByText('明暗模式', { exact: true })
    .locator('..')
    .getByRole('button', { name: '深色' })
    .click();
  // useTheme 把 .dark class 加到 html
  await expect(win.locator('html')).toHaveClass(/dark/);
});

test('切换默认浅色主题，移除 dark class', async () => {
  await openSettings(win);
  await win
    .getByText('明暗模式', { exact: true })
    .locator('..')
    .getByRole('button', { name: '浅色' })
    .click();
  await expect(win.locator('html')).not.toHaveClass(/dark/);
});

test('重置所有数据：二次确认后数据清空且项目列表为空', async () => {
  // 首启无项目，先建一个再加任务
  await createProject(win, '数据项目');
  await addTodo(win, '重置前任务');
  await expect(win.getByText('重置前任务', { exact: true })).toBeVisible();

  await openSettingsSection(win, '数据');
  await win.getByText('重置所有数据', { exact: true }).click();
  // 确认对话框：按 Enter 确认（ConfirmDialog 监听 Enter）
  await expect(win.getByRole('heading', { name: '重置所有数据' })).toBeVisible();
  await win.keyboard.press('Enter');

  // 设置面板关闭（handleResetData 里 setSettingsOpen(false)）
  await expect(win.getByRole('region', { name: '设置' })).toHaveCount(0);
  // 数据清空：任务消失
  await expect(win.getByText('重置前任务', { exact: true })).toHaveCount(0);
  // 重置后项目列表为空，主区显示无项目引导（不再自动重建默认项目）
  await expect(win.getByRole('button', { name: '数据项目（拖动以排序）' })).toHaveCount(0);
  await expect(win.getByRole('heading', { name: '还没有项目' })).toBeVisible();
});

test('设置作为独立页面打开，并可返回待办页', async () => {
  await openSettings(win);
  await expect(win.getByRole('button', { name: '返回待办' })).toBeVisible();
  await win.getByRole('button', { name: '返回待办' }).click();
  await expect(win.getByRole('region', { name: '设置' })).toHaveCount(0);
  await expect(win.locator('main')).toBeVisible();
});

test('返回待办页后立即点击主页面，不被退场浮层拦截', async () => {
  // 回归：SettingsPanel 关闭时若残留 fixed inset-0 浮层（如 framer-motion exit 淡出
  // 期间元素仍在 DOM 且 opacity:0 不取消 pointer-events），会吞掉对主页面的点击 ——
  // 用户从设置页返回后立即点击待办会「点不动」。
  //
  // 复现关键：toggle.click({ force: true }) 跳过 Playwright 的 actionability 等待
  // （否则会自动等到浮层消失再点，测不出 bug）。force 仍把点击派发到 toggle 元素本身，
  // 所以能稳定验证「点击是否落到主页面」：若退场浮层拦截，则点击被吞、切换不发生。
  //
  // 用两条事项：完成其一不会触发 AllDoneCelebration（否则列表被替换、行内按钮消失）。
  await createProject(win, '回归项目');
  await addTodosBulk(win, ['回归事项A', '回归事项B']);
  const row = todoRow(win, '回归事项A');
  const toggle = row.getByRole('button', { name: '标记为已完成' });
  await expect(toggle).toBeVisible();

  await openSettings(win);
  await win.getByRole('button', { name: '返回待办' }).click();
  // 关键：force=true 立刻派发点击，不等浮层消失 —— 复现「点不动」的时序
  await toggle.click({ force: true });
  // 切换成功 = 按钮变成「标记为未完成」。若退场浮层吞掉了点击，这里会超时失败。
  await expect(row.getByRole('button', { name: '标记为未完成' })).toBeVisible();
});
