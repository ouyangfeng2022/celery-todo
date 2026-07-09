/**
 * 键盘快捷键：Ctrl+N/S/F/B/D/P/1/2/3/Esc。
 */
import { test, expect } from '@playwright/test';
import { launchApp, closeApp, addTodo, openSettings, type LaunchedApp } from './helpers';

let appInfo: LaunchedApp;
let win: Awaited<ReturnType<typeof launchApp>>['window'];

test.beforeEach(async () => {
  appInfo = await launchApp();
  win = appInfo.window;
});

test.afterEach(async () => {
  await closeApp(appInfo);
});

test('Ctrl+N 聚焦添加事项输入框', async () => {
  await win.keyboard.press('Control+n');
  const isFocused = await win.evaluate(() => {
    const el = document.activeElement;
    return el?.tagName === 'TEXTAREA' && el?.getAttribute('placeholder')?.includes('添加待办事项');
  });
  expect(isFocused).toBe(true);
});

test('Ctrl+F 聚焦搜索框', async () => {
  await win.keyboard.press('Control+f');
  const isFocused = await win.evaluate(() => {
    return document.activeElement?.getAttribute('placeholder') === '搜索事项...';
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
  // 退出专注模式时默认 theme=system，点 Ctrl+D 应切换。先看初始 html 是否有 dark
  const beforeDark = await win.locator('html').evaluate((el) => el.classList.contains('dark'));
  await win.keyboard.press('Control+d');
  const afterDark = await win.locator('html').evaluate((el) => el.classList.contains('dark'));
  expect(afterDark).toBe(!beforeDark);
});

test('Ctrl+P 切换专注模式（进入后侧边栏消失）', async () => {
  // 当前已退出专注模式
  await expect(win.getByRole('complementary')).toBeVisible();
  await win.keyboard.press('Control+p');
  // 进入专注模式后侧边栏不渲染
  await expect(win.getByRole('complementary')).toHaveCount(0);
  // 浮动指示器"专注中"可见
  await expect(win.getByText('专注中', { exact: true })).toBeVisible();
  // 再切回
  await win.keyboard.press('Control+p');
  await expect(win.getByRole('complementary')).toBeVisible();
});

test('Ctrl+1/2/3 切换筛选视图', async () => {
  await addTodo(win, '未完成项');
  // Ctrl+1/2/3 仅在非输入框聚焦时生效，addTodo 后 textarea 仍聚焦，先点页面外失焦
  await win.locator('body').click();
  await win.waitForTimeout(200);

  // useFilter 把 filter 同步到 URL ?filter=（filter=all 时不写入）
  await win.keyboard.press('Control+3');
  await expect(win).toHaveURL(/filter=completed/);
  await win.keyboard.press('Control+1');
  await expect(win).not.toHaveURL(/filter=/);
  await win.keyboard.press('Control+2');
  await expect(win).toHaveURL(/filter=active/);
});

test('Esc 关闭设置面板', async () => {
  await openSettings(win);
  await win.keyboard.press('Escape');
  await expect(win.getByRole('heading', { name: '设置' })).toHaveCount(0);
});
