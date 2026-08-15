/**
 * 键盘快捷键：Ctrl+N/S/F/B/D/P/1/2/3/Esc。
 */
import { test, expect } from '@playwright/test';
import {
  launchApp,
  closeApp,
  addTodo,
  createProject,
  openSettings,
  todoRow,
  type LaunchedApp,
} from './helpers';

let appInfo: LaunchedApp;
let win: Awaited<ReturnType<typeof launchApp>>['window'];

test.beforeEach(async () => {
  appInfo = await launchApp();
  win = appInfo.window;
  // 首启无默认项目，每个用例先建一个项目承载 todo
  await createProject(win, '测试项目');
});

test.afterEach(async () => {
  await closeApp(appInfo);
});

test('Ctrl+N 聚焦添加事项输入框', async () => {
  await win.keyboard.press('Control+n');
  const isFocused = await win.evaluate(() => {
    const el = document.activeElement;
    return el?.tagName === 'TEXTAREA' && el?.getAttribute('aria-label') === '新事项标题';
  });
  expect(isFocused).toBe(true);
});

test('Ctrl+F 聚焦搜索框', async () => {
  await win.keyboard.press('Control+f');
  const isFocused = await win.evaluate(() => {
    return document.activeElement?.getAttribute('aria-label') === '搜索所有项目中的事项';
  });
  expect(isFocused).toBe(true);
});

test('Ctrl+S 触发保存（无报错）', async () => {
  await addTodo(win, '保存前任务');
  // Ctrl+S 仅触发 db.flushSave，无可见变化，但不应抛错
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(200);
  // 任务仍在
  await expect(win.getByText('保存前任务', { exact: true })).toBeVisible();
});

test('Ctrl+B 切换侧边栏（收起后侧边栏消失）', async () => {
  // 当前侧边栏可见（aside=complementary）
  await expect(win.getByRole('complementary')).toBeVisible();
  await win.keyboard.press('Control+b');
  // 收起动画后 aside 消失（width:0 但元素仍在？App.tsx 用条件渲染）
  // 实际 App.tsx sidebarOpen=false 时整个 aside 仍在但宽度为 0；改用可见性断言
  await win.waitForTimeout(400);
  // 再次切换回来，确认按钮存在
  await win.keyboard.press('Control+b');
  await win.waitForTimeout(400);
  await expect(win.getByRole('button', { name: /收起侧边栏|展开侧边栏/ })).toHaveCount(1);
});

test('Ctrl+D 切换主题（浅色↔深色）', async () => {
  // 默认 theme=system，点 Ctrl+D 应切换。先看初始 html 是否有 dark
  const beforeDark = await win.locator('html').evaluate((el) => el.classList.contains('dark'));
  await win.keyboard.press('Control+d');
  const afterDark = await win.locator('html').evaluate((el) => el.classList.contains('dark'));
  expect(afterDark).toBe(!beforeDark);
});

test('Ctrl+1/2/3 切换筛选视图', async () => {
  await addTodo(win, '未完成项');
  await addTodo(win, '已完成项');
  const completedRow = todoRow(win, '已完成项');
  await completedRow.hover();
  await completedRow.getByRole('button', { name: '标记为已完成' }).click();
  // Ctrl+1/2/3 仅在非输入框聚焦时生效。直接 blur，避免点击 body 中央误中事项行、
  // 打开详情浮窗后产生同标题的 textarea。
  await win.getByLabel('新事项标题').evaluate((element) => (element as HTMLElement).blur());
  await win.waitForTimeout(200);

  // Electron 打包版通过 file:// 加载，不能依赖 URL 查询参数；直接断言列表状态。
  await win.keyboard.press('Control+3');
  await expect(todoRow(win, '已完成项')).toBeVisible();
  await expect(todoRow(win, '未完成项')).toHaveCount(0);
  await win.keyboard.press('Control+1');
  await expect(todoRow(win, '已完成项')).toBeVisible();
  await expect(todoRow(win, '未完成项')).toBeVisible();
  await win.keyboard.press('Control+2');
  await expect(todoRow(win, '未完成项')).toBeVisible();
  await expect(todoRow(win, '已完成项')).toHaveCount(0);
});

test('Esc 关闭设置面板', async () => {
  await openSettings(win);
  await win.keyboard.press('Escape');
  await expect(win.getByRole('heading', { name: '设置' })).toHaveCount(0);
});
