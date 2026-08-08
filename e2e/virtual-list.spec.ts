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
const thousandScaleTitles = Array.from(
  { length: 900 },
  (_, index) => `千条基准事项 ${String(index + 1).padStart(4, '0')}`,
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
  const list = win.getByLabel('待办事项列表');

  // 未滚动时末行不应挂载，证明这里确实走了虚拟列表分支而非普通完整 DOM。
  await expect(list.getByText(lastTitle, { exact: true })).toHaveCount(0);

  await main.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(list.getByText(lastTitle, { exact: true })).toBeVisible();

  // 回到顶部再通过搜索选择末行：TodoList 应先 scrollToIndex，再挂载并高亮目标行。
  await main.evaluate((element) => {
    element.scrollTop = 0;
  });
  await win.getByRole('button', { name: '搜索所有项目中的事项' }).click();
  const search = win.getByPlaceholder('搜索所有项目中的事项...');
  await search.fill(lastTitle);
  await win.getByRole('option', { name: new RegExp(lastTitle) }).click();

  await expect(list.getByText(lastTitle, { exact: true })).toBeVisible();
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test('101 条事项中末行可通过指针跨越虚拟窗口拖拽上移', async () => {
  const lastTitle = titles[titles.length - 1]!;
  const targetTitle = titles[80]!;
  const main = win.locator('main');
  await main.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });

  const lastRow = win
    .locator('div.group.relative.flex.items-center.gap-3')
    .filter({ has: win.getByText(lastTitle, { exact: true }) });
  const targetRow = win
    .locator('div.group.relative.flex.items-center.gap-3')
    .filter({ has: win.getByText(targetTitle, { exact: true }) });
  const handle = lastRow.getByRole('button', { name: '拖拽排序' });
  const [handleBox, mainBox] = await Promise.all([handle.boundingBox(), main.boundingBox()]);
  if (!handleBox || !mainBox) throw new Error('无法获取拖拽手柄或滚动容器的位置');

  // PointerSensor 不受 KeyboardSensor 碰撞坐标步长影响。指针停在主滚动区上缘，
  // 让 dnd-kit autoScroll 驱动虚拟列表向上滚动，直到原本屏外的 081 实际进入视口。
  await win.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await win.mouse.down();
  await win.mouse.move(handleBox.x + handleBox.width / 2, mainBox.y + 8, { steps: 8 });
  await expect
    .poll(() => main.evaluate((element) => element.scrollTop), { timeout: 5_000 })
    .toBeLessThan(await main.evaluate((element) => element.scrollHeight - element.clientHeight));
  await expect(targetRow).toBeVisible({ timeout: 10_000 });

  const targetBox = await targetRow.boundingBox();
  if (!targetBox) throw new Error('自动滚动后目标事项仍未处于可拖放区域');
  await win.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 8,
  });
  await win.mouse.up();

  await expect(win.getByLabel('排序方式')).toHaveValue('manual');
  // 落定后从 DB 读取持久化顺序：源行（101）已稳定落在目标行（081）之前。
  const projectId = (
    (await win.evaluate(() => window.electronAPI!.dataQuery('projects'))) as {
      id: string;
      name: string;
    }[]
  ).find((p) => p.name === '虚拟列表测试项目')!.id;
  const indexOfInSorted = async () => {
    const rows = (await win.evaluate(
      (id) => window.electronAPI!.dataQuery('todosByProject', { projectId: id }),
      projectId,
    )) as { title: string }[];
    return { p101: rows.findIndex((r) => r.title === lastTitle), p081: rows.findIndex((r) => r.title === targetTitle) };
  };
  await expect
    .poll(
      async () => {
        const { p101, p081 } = await indexOfInSorted();
        return p101 >= 0 && p081 >= 0 ? p101 < p081 : false;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
});

test('1,001 条事项仅挂载有限 DOM 行，且可定位末行', async () => {
  const input = win.getByLabel('新事项标题');
  const list = win.getByLabel('待办事项列表');
  const lastTitle = thousandScaleTitles[thousandScaleTitles.length - 1]!;

  // 在已有 101 条的真实 UI 数据上继续批量添加，覆盖超过千条时的渲染路径。
  await input.fill(thousandScaleTitles.join('\n'));
  await win.keyboard.press('Enter');
  await expect(input).toHaveValue('');
  // 等待 React 提交新的总行数；否则紧接着读取的 scrollHeight 仍是旧的 101 条高度。
  await expect(win.getByRole('button', { name: '全部 1001' })).toBeVisible();

  // 搜索定位会走 virtualizer.scrollToIndex，覆盖大数据量下末行的按需挂载。
  await win.getByRole('button', { name: '搜索所有项目中的事项' }).click();
  const search = win.getByPlaceholder('搜索所有项目中的事项...');
  await search.fill(lastTitle);
  await win.getByRole('option', { name: new RegExp(lastTitle) }).click();
  await expect(list.getByText(lastTitle, { exact: true })).toBeVisible();

  // 视口行 + overscan 应始终远少于总量，避免 Markdown / dnd-kit 为千条事项建完整 DOM。
  await expect.poll(async () => list.locator(':scope > div').count()).toBeLessThan(80);
});
