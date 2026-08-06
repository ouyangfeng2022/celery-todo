/**
 * 虚拟事项列表：超过阈值后的滚动、搜索定位与键盘拖拽。
 *
 * 这组用例必须通过真实 UI 一次性批量造数，不能绕过 renderer 直接写 SQLite；
 * 否则无法覆盖 React virtualizer 与 dnd-kit 的集成路径。
 */
import { test, expect } from '@playwright/test';
import { launchApp, closeApp, createProject, type LaunchedApp } from './helpers';

let appInfo: LaunchedApp;
let win: Awaited<ReturnType<typeof launchApp>>['window'];

const titles = Array.from(
  { length: 101 },
  (_, index) => `虚拟事项 ${String(index + 1).padStart(3, '0')}`,
);

test.beforeEach(async () => {
  appInfo = await launchApp();
  win = appInfo.window;
  await createProject(win, '虚拟列表测试项目');

  // 一次提交走 addTodosBulk；逐条 add 会让本用例的造数成本掩盖虚拟化收益。
  const input = win.getByLabel('新事项标题');
  await input.fill(titles.join('\n'));
  await win.keyboard.press('Enter');
  await expect(win.getByText(titles[0]!, { exact: true })).toBeVisible();
});

test.afterEach(async () => {
  await closeApp(appInfo);
});

test('101 条事项可滚至末行，并能由全局搜索定位到虚拟行', async () => {
  const lastTitle = titles[titles.length - 1]!;
  const main = win.locator('main');

  // 未滚动时末行不应挂载，证明这里确实走了虚拟列表分支而非普通完整 DOM。
  await expect(win.getByText(lastTitle, { exact: true })).toHaveCount(0);

  await main.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(win.getByText(lastTitle, { exact: true })).toBeVisible();

  // 回到顶部再通过搜索选择末行：TodoList 应先 scrollToIndex，再挂载并高亮目标行。
  await main.evaluate((element) => {
    element.scrollTop = 0;
  });
  await win.getByRole('button', { name: '搜索所有项目中的事项' }).click();
  const search = win.getByPlaceholder('搜索所有项目中的事项...');
  await search.fill(lastTitle);
  await win.getByRole('option', { name: new RegExp(lastTitle) }).click();

  await expect(win.getByText(lastTitle, { exact: true })).toBeVisible();
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test('101 条事项中末行可通过键盘拖拽上移', async () => {
  const lastTitle = titles[titles.length - 1]!;
  const previousTitle = titles[titles.length - 2]!;
  const main = win.locator('main');
  await main.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });

  const lastRow = win
    .locator('div.group.relative.flex.items-center.gap-3')
    .filter({ has: win.getByText(lastTitle, { exact: true }) });
  await lastRow.hover();
  const handle = lastRow.getByRole('button', { name: '拖拽排序' });
  await handle.focus();
  await win.keyboard.press('Space');
  await win.keyboard.press('ArrowUp');
  await win.keyboard.press('Space');

  await expect(win.getByLabel('排序方式')).toHaveValue('manual');
  await expect
    .poll(async () => {
      const lastBox = await lastRow.boundingBox();
      const previousBox = await win
        .locator('div.group.relative.flex.items-center.gap-3')
        .filter({ has: win.getByText(previousTitle, { exact: true }) })
        .boundingBox();
      return lastBox && previousBox ? lastBox.y < previousBox.y : false;
    })
    .toBe(true);
});
