/**
 * 贴图（简洁模式）窗口 E2E：创建、切换项目、标记完成、复制、关闭。
 *
 * 多窗口注意：主进程在 sticker:create 后调用 mainWindow.hide()，主窗口被
 * 隐藏但仍存在；贴图窗口作为第二个 Page 出现，用 app.waitForEvent('window')
 * 拿到。所有交互都在贴图 page 上进行，不去操作被 hide 的主窗口。
 *
 * 入口选择：从项目侧栏右键菜单「创建贴图」进入，而非 Header「进入简洁模式」
 * 菜单项——项目一定存在、定位最稳，且与 projects.spec.ts 既有 case 一致。
 */
import { test, expect, type Page } from '@playwright/test';
import {
  launchApp,
  closeApp,
  addTodo,
  createProject,
  openProjectContextMenu,
  waitForSave,
  type LaunchedApp,
} from './helpers';

let appInfo: LaunchedApp;
let win: Page;

test.beforeEach(async () => {
  appInfo = await launchApp();
  win = appInfo.window;
});

test.afterEach(async () => {
  await closeApp(appInfo);
});

/**
 * 从指定项目右键创建贴图，返回贴图窗口 Page（已等首屏 shell 渲染）。
 * todo 列表由 initDatabase 异步加载，调用方用 expect(todoText).toBeVisible() 自动等待。
 */
async function createSticker(projectName: string): Promise<Page> {
  await openProjectContextMenu(win, projectName);
  const stickerPromise = appInfo.app.waitForEvent('window');
  await win.getByRole('button', { name: '创建贴图', exact: true }).click();
  const sticker = await stickerPromise;
  await sticker.waitForLoadState('domcontentloaded');
  await sticker.locator('.sticker-shell').waitFor({ state: 'visible' });
  return sticker;
}

test('从项目右键菜单创建贴图，显示该项目未完成 todo', async () => {
  await createProject(win, '贴图项目');
  await addTodo(win, '贴图任务 A');
  await addTodo(win, '贴图任务 B');
  await waitForSave(win);

  const sticker = await createSticker('贴图项目');
  await expect(sticker.getByText('贴图任务 A')).toBeVisible();
  await expect(sticker.getByText('贴图任务 B')).toBeVisible();
  // 头部统计行：2 项待完成
  await expect(sticker.getByText('2 项待完成')).toBeVisible();
});

test('贴图切换项目后列表随之刷新', async () => {
  await createProject(win, '项目甲');
  await addTodo(win, '甲任务');
  await createProject(win, '项目乙');
  await addTodo(win, '乙任务');
  await waitForSave(win);

  const sticker = await createSticker('项目甲');
  await expect(sticker.getByText('甲任务')).toBeVisible();
  await expect(sticker.getByText('乙任务')).toHaveCount(0);

  const projectSelect = sticker.getByLabel('选择贴图项目');
  // 项目名称悬浮时显示深色圆角背景，展开列表保持普通面板背景。
  await projectSelect.hover();
  await expect
    .poll(() => projectSelect.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe('rgba(0, 0, 0, 0)');
  expect(await projectSelect.evaluate((element) => getComputedStyle(element).borderRadius)).toBe(
    '12px',
  );
  await projectSelect.click();
  const projectMenu = sticker.getByRole('listbox', { name: '贴图项目列表' });
  await expect(projectMenu).toBeVisible();
  expect(await projectSelect.evaluate((element) => getComputedStyle(element).borderRadius)).toBe(
    '12px',
  );
  await projectSelect.focus();
  expect(await projectSelect.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe(
    'none',
  );

  await projectMenu.getByRole('option', { name: '项目乙' }).click();
  // 项目切换会重建列表动画边界，旧项目行不应继续以 exit 节点滞留。
  expect(await sticker.getByText('甲任务').count()).toBe(0);
  await expect(sticker.getByText('乙任务')).toBeVisible();
});

test('贴图点击 todo 标记完成，该 todo 从贴图消失', async () => {
  await createProject(win, '完成测试');
  await addTodo(win, '待完成任务');
  await waitForSave(win);

  const sticker = await createSticker('完成测试');
  await expect(sticker.getByText('待完成任务')).toBeVisible();
  // 贴图 todo 整行是 button，点击 title span 冒泡到 button → toggle 完成
  await sticker.getByText('待完成任务').click();
  // 贴图只显示未完成，完成后 AnimatePresence 移除该行
  await expect(sticker.getByText('待完成任务')).toHaveCount(0);
});

test('右键复制贴图：打开第二个贴图窗口', async () => {
  await createProject(win, '复制源');
  await addTodo(win, '复制任务');
  await waitForSave(win);

  const sticker = await createSticker('复制源');
  await sticker.locator('.sticker-shell').click({ button: 'right' });
  const dupPromise = appInfo.app.waitForEvent('window');
  await sticker.getByRole('button', { name: '复制贴图', exact: true }).click();
  const dup = await dupPromise;
  await dup.waitForLoadState('domcontentloaded');
  await expect(dup.getByText('复制任务')).toBeVisible();
});

test('右键关闭贴图：关闭当前贴图窗口', async () => {
  await createProject(win, '关闭测试');
  await addTodo(win, '占位任务');
  await waitForSave(win);

  const sticker = await createSticker('关闭测试');
  await sticker.locator('.sticker-shell').click({ button: 'right' });
  // 「关闭贴图」同时存在于头部按钮（aria-label）与右键菜单项；
  // scope 到菜单容器（ContextMenu 根 div class 含 "z-[60]"，全页独有）避免歧义
  const menu = sticker.locator('[class*="z-[60]"]');
  const closeItem = menu.getByRole('button', { name: '关闭贴图', exact: true });
  await expect(closeItem).toBeVisible();
  // 点击菜单项 → closeSticker IPC → window.close() → page 销毁。任何 Playwright
  // action（click/dispatchEvent/evaluate）都需等浏览器 ACK 才返回，page 关闭会
  // 断开连接导致该 action reject。故先挂 close 监听，再用 evaluate 触发点击并
  // 吞掉其 reject（page 关闭所致），最后断言 close 事件已触发。
  const closePromise = sticker.waitForEvent('close', { timeout: 5000 });
  await sticker
    .evaluate(() => {
      const target = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === '关闭贴图',
      );
      target?.click();
    })
    .catch(() => {
      // page 因点击触发的关闭而销毁，evaluate reject 是预期路径
    });
  await closePromise;
  expect(appInfo.app.windows().includes(sticker)).toBeFalsy();
});

test('头部关闭按钮关闭贴图窗口', async () => {
  await createProject(win, '头部关闭');
  await addTodo(win, '占位任务');
  await waitForSave(win);

  const sticker = await createSticker('头部关闭');
  const closePromise = sticker.waitForEvent('close');
  // 菜单未打开，全页仅头部一个 name=关闭贴图 的按钮（aria-label），无歧义
  await sticker.getByRole('button', { name: '关闭贴图', exact: true }).click();
  await closePromise;
  expect(appInfo.app.windows().includes(sticker)).toBeFalsy();
});
