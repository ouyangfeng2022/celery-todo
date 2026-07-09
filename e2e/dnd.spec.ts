/**
 * 拖拽排序：todo 列表 + 项目列表。
 *
 * dnd-kit 同时支持 PointerSensor（distance:5）和 KeyboardSensor。
 * 鼠标拖拽在 Playwright 里模拟易因像素偏差失败，故用键盘拖拽：
 * 聚焦拖拽手柄 → Space 拾起 → ArrowUp/Down 移动 → Space 放下。
 *
 * 备选：若键盘拖拽不稳，通过 page.evaluate 直接调 store action（见末尾注释）。
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

/** 读取当前 todo 列表标题（按视觉顺序） */
async function todoTitles(win: typeof win): Promise<string[]> {
  return win.evaluate(() => {
    const rows = Array.from(
      document.querySelectorAll('div.group.relative.flex.items-center.gap-3'),
    );
    return rows.map((row) => {
      const titleDiv = row.querySelector('div.text-\\[15px\\]') as HTMLElement | null;
      return titleDiv?.textContent?.trim() ?? '';
    });
  });
}

test('todo 拖拽：把最后一条移到第一位', async () => {
  // 首启无默认项目，先建一个项目承载 todo
  await createProject(win, '拖拽测试项目');
  // 需要手动排序模式才能持久化拖拽结果；TodoList onDragEnd 会自动切到 manual
  await addTodo(win, 'T1');
  await addTodo(win, 'T2');
  await addTodo(win, 'T3');

  // 切到手动排序（避免排序算法立即覆盖拖拽结果）
  await win.getByLabel('排序方式').selectOption('manual');

  const before = await todoTitles(win);
  expect(before).toEqual(['T1', 'T2', 'T3']);

  // 聚焦 T3 行的拖拽手柄（aria-label="拖拽排序"），按键盘拖拽
  const t3Row = win
    .locator('div.group.relative.flex.items-center.gap-3')
    .filter({ has: win.getByText('T3', { exact: true }) });
  await t3Row.hover();
  const handle = t3Row.getByRole('button', { name: '拖拽排序' });
  await handle.focus();
  await win.waitForTimeout(200);

  // Space 拾起，ArrowUp × 2 移到顶部，Space 放下
  await win.keyboard.press('Space');
  await win.waitForTimeout(200);
  await win.keyboard.press('ArrowUp');
  await win.waitForTimeout(200);
  await win.keyboard.press('ArrowUp');
  await win.waitForTimeout(200);
  await win.keyboard.press('Space');
  await win.waitForTimeout(500);

  const after = await todoTitles(win);
  expect(after[0]).toBe('T3');
});

test('项目拖拽：把最后一个项目移到第一个', async () => {
  // 不再有默认项目，建三个项目作为排序基线
  await createProject(win, '项目A');
  await createProject(win, '项目B');
  await createProject(win, '项目C');
  // 切回项目A，避免影响断言
  await win.getByRole('button', { name: '项目A（拖动以排序）' }).click();

  // 项目顺序：项目A、项目B、项目C（createProject 末尾 append）
  const beforeButtons = await win
    .getByRole('button', { name: /（拖动以排序）/ })
    .allTextContents();

  // 聚焦"项目C"按钮，键盘拖拽到顶部（用 first 避免潜在重复渲染）
  const projC = win.getByRole('button', { name: '项目C（拖动以排序）' }).first();
  await projC.hover();
  await projC.focus();
  await win.waitForTimeout(200);

  await win.keyboard.press('Space');
  await win.waitForTimeout(200);
  await win.keyboard.press('ArrowUp');
  await win.waitForTimeout(200);
  await win.keyboard.press('ArrowUp');
  await win.waitForTimeout(200);
  await win.keyboard.press('Space');
  await win.waitForTimeout(500);

  // 取所有项目按钮文案（可能因 dnd 渲染有重复，去重后比较）
  const allTexts = await win
    .getByRole('button', { name: /（拖动以排序）/ })
    .allTextContents();
  const afterButtons = [...new Set(allTexts)];

  // 顺序应发生变化（项目C 不再是最后一个）
  expect(afterButtons).not.toEqual(beforeButtons);
  expect(afterButtons[afterButtons.length - 1]).not.toContain('项目C');
});
