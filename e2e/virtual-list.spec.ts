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

test('101 条事项中末行可通过键盘跨越虚拟窗口拖拽上移', async () => {
  const lastTitle = titles[titles.length - 1]!;
  const targetTitle = titles[80]!;
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
  await win.waitForTimeout(200);

  // Space 拾起，ArrowUp × 20 移过整屏，Space 放下。
  // dnd-kit 的 KeyboardSensor 每次按键需一个动画帧推进碰撞/坐标，背靠背连发会让
  // 后续按键在 sensor 处理完上一帧前到达，dragStart/dragEnd 可能完全不触发
  // （见同仓 e2e/dnd.spec.ts 同样在每次按键间等 200ms）。
  await win.keyboard.press('Space');
  await win.waitForTimeout(300);

  // 超出末屏 overscan：拖拽开始后应临时挂载完整列表，供 dnd-kit 找到屏幕外目标。
  // 每次按键间等 200ms：dnd-kit KeyboardSensor 每次按键需一帧推进碰撞/坐标，CI
  // runner 较慢，背靠背连发会丢键、导致移动距离不足（对齐 e2e/dnd.spec.ts 的节奏）。
  // 22 次而非正好 20 次：101 在索引 100、目标 081 在索引 80，正 20 次只能落在目标位
  // （over===active 不触发 reorder）；多 2 次留出余量让 101 落到 081 之前。
  for (let index = 0; index < 22; index += 1) {
    await win.keyboard.press('ArrowUp');
    await win.waitForTimeout(200);
  }
  await win.keyboard.press('Space');
  await win.waitForTimeout(800);

  // DEBUG-CI: 看 101/081 实际落在哪
  const projectIdDbg = (
    (await win.evaluate(() => window.electronAPI!.dataQuery('projects'))) as {
      id: string;
      name: string;
    }[]
  ).find((p) => p.name === '虚拟列表测试项目')!.id;
  const rowsDbg = (await win.evaluate(
    (id) => window.electronAPI!.dataQuery('todosByProject', { projectId: id }),
    projectIdDbg,
  )) as { title: string }[];
  const titles101 = rowsDbg.map((r) => r.title);
  const debugInfo = {
    pos101: titles101.indexOf(lastTitle),
    pos081: titles101.indexOf(targetTitle),
    sampleAround80: titles101.slice(78, 84),
    sort: await win.getByLabel('排序方式').inputValue(),
  };
  console.error('[DEBUG-CI-POS]', JSON.stringify(debugInfo));

  await expect(win.getByLabel('排序方式')).toHaveValue('manual');
  // 跨视口拖拽后，源行（101）应落在目标行（081）之前。两条行此时都不一定挂载
  // （虚拟化 + 拖拽后视口位置变化），boundingBox 会返回 null、且不在同一视口时无法
  // 直接比较 y 坐标。改为查主进程 dataQuery('todosByProject') 的 DB 序
  // （pinned DESC, sort_order）比较两条 todo 的索引 —— manual 排序视图唯一权威顺序。
  // moveTodoRank 是主进程同步 DB 写，drop 完即生效。
  const indexOfInSorted = async (title: string) => {
    const projectId = (
      (await win.evaluate(() =>
        window.electronAPI!.dataQuery('projects'),
      )) as { id: string; name: string }[]
    ).find((p) => p.name === '虚拟列表测试项目')!.id;
    const rows = (await win.evaluate((id) => window.electronAPI!.dataQuery('todosByProject', { projectId: id }), projectId)) as {
      title: string;
    }[];
    return rows.findIndex((r) => r.title === title);
  };
  await expect
    .poll(
      async () => {
        const lastIdx = await indexOfInSorted(lastTitle);
        const targetIdx = await indexOfInSorted(targetTitle);
        return lastIdx >= 0 && targetIdx >= 0 ? lastIdx < targetIdx : false;
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
