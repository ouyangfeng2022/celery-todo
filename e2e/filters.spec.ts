/**
 * 过滤 / 排序 / 清空已完成 / URL 参数预设。
 */
import { test, expect } from '@playwright/test';
import { launchApp, closeApp, addTodo, createProject, type LaunchedApp } from './helpers';

let appInfo: LaunchedApp;
let win: Awaited<ReturnType<typeof launchApp>>['window'];

test.beforeEach(async () => {
  appInfo = await launchApp();
  win = appInfo.window;
  // 首启无默认项目，先建一个项目再造数据
  await createProject(win, '测试项目');
  // 造数据：3 条未完成 + 2 条已完成
  await addTodo(win, '进行中1');
  await addTodo(win, '进行中2');
  await addTodo(win, '进行中3');
  await addTodo(win, '已完成1');
  await addTodo(win, '已完成2');

  // 完成后两条
  for (const t of ['已完成1', '已完成2']) {
    const row = win.getByText(t, { exact: true }).locator('xpath=ancestor::div[contains(@class,"group")][1]');
    await row.hover();
    await row.getByRole('button', { name: '标记为已完成' }).click();
  }
});

test.afterEach(async () => {
  await closeApp(appInfo);
});

/**
 * 定位 todo 标题：限定在列表行容器内，避免与过滤按钮徽章文案（如"已完成 2"）混淆。
 * 行容器 class 含 "group relative flex items-center gap-3"，标题是其内 div.text-[15px]
 */
function todoTitle(win: typeof win, title: string) {
  return win.locator('div.group.relative.flex.items-center.gap-3').filter({
    has: win.locator(`div.text-\\[15px\\]`, { hasText: title }),
  });
}

test('"全部"显示所有 5 条', async () => {
  await win.getByRole('button', { name: /全部/ }).click();
  await expect(todoTitle(win, '进行中1')).toBeVisible();
  await expect(todoTitle(win, '已完成1')).toBeVisible();
  await expect(todoTitle(win, '已完成2')).toBeVisible();
});

test('"进行中"仅显示未完成的 3 条', async () => {
  await win.getByRole('button', { name: /进行中/ }).click();
  await expect(todoTitle(win, '进行中1')).toBeVisible();
  await expect(todoTitle(win, '已完成1')).toHaveCount(0);
  await expect(todoTitle(win, '已完成2')).toHaveCount(0);
});

test('"已完成"仅显示已完成的 2 条', async () => {
  await win.getByRole('button', { name: /^已完成/ }).click();
  await expect(todoTitle(win, '已完成1')).toBeVisible();
  await expect(todoTitle(win, '已完成2')).toBeVisible();
  await expect(todoTitle(win, '进行中1')).toHaveCount(0);
});

test('过滤按钮右侧徽章计数正确', async () => {
  // 全部=5，进行中=3，已完成=2（name 形如 "全部 5"）
  await expect(win.getByRole('button', { name: '全部 5' })).toBeVisible();
  await expect(win.getByRole('button', { name: '进行中 3' })).toBeVisible();
  await expect(win.getByRole('button', { name: '已完成 2' })).toBeVisible();
});

test('排序下拉框默认只有「创建时间 / 优先级」两项', async () => {
  // 「创建时间 ↑」与「手动排序」均不应作为常规选项出现
  const select = win.getByLabel('排序方式');
  await expect(select).toHaveValue('created-desc');
  await expect(select.locator('option')).toHaveText(['创建时间', '优先级']);
});

test('切换排序方式为"优先级"，同优先级按创建时间降序', async () => {
  // beforeEach 创建的 5 条均默认 medium 优先级。selectOption 切到 priority 后，
  // 比较器主键优先级、次键 createdAt 降序（与 created-desc 一致，新增在前）。
  //
  // 不严格断言完整顺序：addTodo 是程序化快速调用，5 条可能落在同一毫秒，
  // createdAt 字符串相等 → sort 稳定性保留 DB 输入序 → 此场景下顺序不确定。
  // 此为毫秒边界，真实 UI 中连续添加间隔远超 1ms 不会出现。
  // 此处只断言 select 切换成功；下方「不受拖拽残留影响」用例做行为级覆盖。
  await win.getByLabel('排序方式').selectOption('priority');
  await expect(win.getByLabel('排序方式')).toHaveValue('priority');
});

test('优先级模式下，同优先级排序不被历史拖拽残留污染', async () => {
  // 目的：验证「非手动模式严格按时间排序」——即使在 priority 模式下拖拽过，
  // 同优先级的相对顺序也应回到 createdAt 降序，而不是卡在拖拽快照。
  await win.getByLabel('排序方式').selectOption('priority');

  // 1) 造两条高优先级 todo（间隔 >1ms 保证 createdAt 不同）。
  //    addTodo 助手 click textarea 触发 onFocus→setShowOptions(true)，AnimatePresence
  //    展开后高优先级按钮才出现，故这里等「高」按钮可见再点。
  const input = win.getByPlaceholder('添加待办事项...（按 Shift+Enter 换行可批量添加）');
  for (const title of ['H1', 'H2']) {
    await input.click();
    const highBtn = win.getByRole('button', { name: '高', exact: true });
    await highBtn.waitFor({ state: 'visible' });
    await highBtn.click();
    await input.fill(title);
    await win.keyboard.press('Enter');
    await win.getByText(title, { exact: true }).first().waitFor({ state: 'visible' });
    await win.waitForTimeout(20); // 错开 createdAt 毫秒，使 localeCompare 可判大小
  }
  // createdAt 降序 → H2（后造）应排在 H1（先造）之前
  const highTitles = async () => {
    const all = await win
      .locator('div.group.relative.flex.items-center.gap-3')
      .evaluateAll((rows) =>
        rows
          .map((el) => (el.querySelector('div.text-\\[15px\\]') as HTMLElement | null)?.textContent?.trim() ?? '')
          .filter((t) => t === 'H1' || t === 'H2'),
      );
    return all;
  };
  expect(await highTitles()).toEqual(['H2', 'H1']);

  // 2) 拖拽把 H1 移到 H2 前面 —— 触发 snapshotOrder 把「H1, H2」写进 todo.order，
  //    sort 自动切到 manual，此刻顺序是 H1 在前。
  const h1Row = win
    .locator('div.group.relative.flex.items-center.gap-3')
    .filter({ has: win.getByText('H1', { exact: true }) });
  await h1Row.hover();
  const handle = h1Row.getByRole('button', { name: '拖拽排序' });
  await handle.focus();
  await win.waitForTimeout(200);
  await win.keyboard.press('Space');
  await win.waitForTimeout(200);
  await win.keyboard.press('ArrowUp');
  await win.waitForTimeout(200);
  await win.keyboard.press('Space');
  await win.waitForTimeout(500);
  await expect(win.getByLabel('排序方式')).toHaveValue('manual');
  expect(await highTitles()).toEqual(['H1', 'H2']);

  // 3) 切回 priority —— 顺序必须回到 createdAt 降序（H2 在前），
  //    而非保留上一步的拖拽顺序（H1 在前）。这正是「手动拖动除外」的语义。
  await win.getByLabel('排序方式').selectOption('priority');
  await win.waitForTimeout(300);
  expect(await highTitles()).toEqual(['H2', 'H1']);
});

test('拖拽后自动进入「手动排序」并作为只读指示项出现，切回规则后消失', async () => {
  // 默认 created-desc 下列表顺序（最新在前）：
  //   已完成2, 已完成1, 进行中3, 进行中2, 进行中1
  // 把最后一条「进行中1」拖到第一位 —— TodoList onDragEnd 会自动 snapshot+切到 manual
  const lastRow = win
    .locator('div.group.relative.flex.items-center.gap-3')
    .filter({ has: win.getByText('进行中1', { exact: true }) });
  await lastRow.hover();
  const handle = lastRow.getByRole('button', { name: '拖拽排序' });
  await handle.focus();
  await win.waitForTimeout(200);

  await win.keyboard.press('Space');
  await win.waitForTimeout(200);
  for (let i = 0; i < 4; i++) {
    await win.keyboard.press('ArrowUp');
    await win.waitForTimeout(100);
  }
  await win.keyboard.press('Space');
  await win.waitForTimeout(500);

  // 拖拽完成后下拉框应自动切到 manual，并多出「手动排序」指示项
  const select = win.getByLabel('排序方式');
  await expect(select).toHaveValue('manual');
  await expect(select.locator('option')).toHaveText(['手动排序', '创建时间', '优先级']);

  // 切回规则排序后「手动排序」指示项应消失
  await select.selectOption('created-desc');
  await expect(select).toHaveValue('created-desc');
  await expect(select.locator('option')).toHaveText(['创建时间', '优先级']);
});

test('"归档已完成"按钮仅在有已完成时显示，点击后归档到历史记录', async () => {
  await expect(win.getByRole('button', { name: '归档已完成' })).toBeVisible();
  await win.getByRole('button', { name: '归档已完成' }).click();
  // 已完成的两条从"全部"视图消失
  await win.getByRole('button', { name: /全部/ }).click();
  await expect(win.getByText('已完成1', { exact: true })).toHaveCount(0);
  await expect(win.getByText('已完成2', { exact: true })).toHaveCount(0);
  // 按钮也随之消失
  await expect(win.getByRole('button', { name: '归档已完成' })).toHaveCount(0);
});

// 回归：快速连续切换 filter 不应卡死。
// 触发条件：AnimatePresence popLayout + 子元素 layout + opacity-exit 三者同时存在
// 命中 framer-motion#2416，退出动画被跳过/滞留，列表内容"切不过去"。
// 不带 toHaveCount 断言等待会掩盖卡死，故每轮立即断言可见性以暴露问题。
test('快速连续切换 filter 不卡死（回归 framer-motion#2416）', async () => {
  const btnAll = win.getByRole('button', { name: /全部/ });
  const btnActive = win.getByRole('button', { name: /进行中/ });
  const btnCompleted = win.getByRole('button', { name: /^已完成/ });

  // 连续 5 轮：全部 → 进行中 → 已完成，中间不停顿等待动画
  for (let i = 0; i < 5; i++) {
    await btnAll.click();
    await expect(todoTitle(win, '进行中1')).toBeVisible();
    await expect(todoTitle(win, '已完成1')).toBeVisible();

    await btnActive.click();
    await expect(todoTitle(win, '进行中1')).toBeVisible();
    await expect(todoTitle(win, '已完成1')).toHaveCount(0);

    await btnCompleted.click();
    await expect(todoTitle(win, '已完成1')).toBeVisible();
    await expect(todoTitle(win, '进行中1')).toHaveCount(0);
  }
});
