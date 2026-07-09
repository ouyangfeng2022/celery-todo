/**
 * 导入导出：项目 JSON / 全量 JSON / CSV / 导入 / 非法导入。
 *
 * 注意：导出走 renderer <a download>，用 page.waitForEvent('download') 捕获。
 *      导入走动态创建的 <input type=file>，用 page.waitForEvent('filechooser') 捕获。
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchApp, closeApp, addTodo, createProject, openSettings, type LaunchedApp } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, 'fixtures');

let appInfo: LaunchedApp;
let win: Awaited<ReturnType<typeof launchApp>>['window'];

test.beforeEach(async () => {
  appInfo = await launchApp();
  win = appInfo.window;
});

test.afterEach(async () => {
  await closeApp(appInfo);
});

/**
 * 拦截 renderer 的 downloadFile：在 window 上挂一个捕获器，
 * export.ts 的 downloadFile 用 <a download> + click，在 Electron 里
 * 不一定触发 Playwright 的 download 事件，故改在调用前注入捕获逻辑。
 *
 * 实现：重写 HTMLAnchorElement.prototype.click，记录最后一次的 download 属性 + blob 内容。
 */
async function installDownloadCapture(win: typeof win): Promise<void> {
  // 在主 frame 和所有未来 frame 注入捕获器（init script 模式更可靠）
  await win.evaluate(() => {
    (window as unknown as { __lastDownload?: { filename: string; content: string } }).__lastDownload = undefined;
    if ((window as unknown as { __downloadHooked?: boolean }).__downloadHooked) return;
    (window as unknown as { __downloadHooked?: boolean }).__downloadHooked = true;
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.download && this.href) {
        void fetch(this.href)
          .then((r) => r.arrayBuffer())
          .then((buf) => {
            // latin1 编码保留每个字节为 charCodeAt，便于测试侧处理 BOM
            const bytes = new Uint8Array(buf);
            let content = '';
            for (let i = 0; i < bytes.length; i++) content += String.fromCharCode(bytes[i]);
            (window as unknown as { __lastDownload?: { filename: string; content: string } }).__lastDownload = {
              filename: this.download,
              content,
            };
          })
          .catch(() => {
            // 忽略
          });
      }
      return origClick.call(this);
    };
  });
}

/** 读取并清空捕获的最后一次下载 */
async function getLastDownload(win: typeof win): Promise<{ filename: string; content: string }> {
  await win.waitForFunction(
    () => !!(window as unknown as { __lastDownload?: unknown }).__lastDownload,
    undefined,
    { timeout: 5_000 },
  );
  return win.evaluate(() => {
    const d = (window as unknown as { __lastDownload?: { filename: string; content: string } }).__lastDownload!;
    (window as unknown as { __lastDownload?: unknown }).__lastDownload = undefined;
    return d;
  });
}

/** 把 latin1 字符串（每 char 一个字节）解码为 UTF-8 字符串（剥掉 BOM）。
 *  捕获时按 latin1 存是为了保留 BOM 字节，但中文是 UTF-8 多字节，需还原解码。 */
function decodeUtf8(content: string): string {
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i++) bytes[i] = content.charCodeAt(i);
  const text = new TextDecoder('utf-8').decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

test('导出单个项目为 JSON，文件名与结构正确', async () => {
  await installDownloadCapture(win);
  await createProject(win, '导出测试');
  await addTodo(win, '被导出任务');

  const projectBtn = win.getByRole('button', { name: '导出测试（拖动以排序）' }).first();
  const projectRow = projectBtn.locator('xpath=ancestor::div[contains(@class,"group")][1]');
  await projectRow.hover();
  await projectRow.getByRole('button', { name: '导出项目' }).click();

  const dl = await getLastDownload(win);
  expect(dl.filename).toBe('导出测试-export.json');
  const data = JSON.parse(decodeUtf8(dl.content));
  expect(data.version).toBe(1);
  expect(data.project.name).toBe('导出测试');
  expect(data.todos.some((t: { title: string }) => t.title === '被导出任务')).toBe(true);
});

test('导出全部数据为 JSON，文件名含日期', async () => {
  await installDownloadCapture(win);
  await addTodo(win, '全量任务');
  await openSettings(win);

  await win.getByText('导出全部数据 (JSON)', { exact: true }).click();
  const dl = await getLastDownload(win);

  const today = new Date().toISOString().slice(0, 10);
  expect(dl.filename).toBe(`celery-todo-backup-${today}.json`);
  const data = JSON.parse(decodeUtf8(dl.content));
  expect(Array.isArray(data.projects)).toBe(true);
  expect(Array.isArray(data.todos)).toBe(true);
  expect(data.todos.some((t: { title: string }) => t.title === '全量任务')).toBe(true);
});

test('导出当前项目为 CSV，含 UTF-8 BOM 和中文表头', async () => {
  await installDownloadCapture(win);
  await addTodo(win, 'CSV任务');
  await openSettings(win);

  await win.getByText('导出当前项目 (CSV)', { exact: true }).click();
  const dl = await getLastDownload(win);

  expect(dl.filename).toBe('todos-默认项目.csv');
  // UTF-8 BOM：第一个字节应为 0xEF（BOM = EF BB BF）
  expect(dl.content.charCodeAt(0)).toBe(0xef);
  // 解码后中文表头与任务行
  const text = decodeUtf8(dl.content);
  expect(text).toContain('标题,描述,已完成,优先级,截止日期,创建时间,完成时间');
  expect(text).toContain('CSV任务');
});

test('导入完整应用数据后项目和 todo 都出现', async () => {
  await openSettings(win);
  const [filechooser] = await Promise.all([
    win.waitForEvent('filechooser'),
    win.getByText('导入数据 (JSON)', { exact: true }).click(),
  ]);
  await filechooser.setFiles(path.join(FIXTURES, 'import-full.json'));
  // 关闭设置面板，否则遮罩拦截后续点击
  await win.keyboard.press('Escape');
  await expect(win.getByRole('heading', { name: '设置' })).toHaveCount(0);

  // 默认项目应含"全量导入的任务1"（importAllData 是异步的，给足等待）
  await expect(win.getByText('全量导入的任务1', { exact: true })).toBeVisible({ timeout: 10_000 });
  // 切换到"导入的项目"看到其 todo
  await win.getByRole('button', { name: '导入的项目（拖动以排序）' }).first().click();
  await expect(win.getByText('导入项目的任务', { exact: true })).toBeVisible();
});

test('导入单个项目后新建该项目并自动切换', async () => {
  await openSettings(win);
  const [filechooser] = await Promise.all([
    win.waitForEvent('filechooser'),
    win.getByText('导入数据 (JSON)', { exact: true }).click(),
  ]);
  await filechooser.setFiles(path.join(FIXTURES, 'import-project.json'));

  await expect(
    win.getByRole('button', { name: '单项目导入（拖动以排序）' }).first(),
  ).toBeVisible({ timeout: 10_000 });
  await expect(win.getByText('单项目导入的任务', { exact: true })).toBeVisible();
});

test('导入非法 JSON 弹出 alert 含"导入失败"', async () => {
  const fs = await import('node:fs');
  const tmp = path.join(appInfo.userData, 'bad.json');
  fs.writeFileSync(tmp, '{ not valid json');

  // 用 onceAndWait 模式：捕获第一个 dialog 并在测试内同步 accept，
  // 避免与 afterEach 的 closeApp 竞态。
  const dialogPromise = win.waitForEvent('dialog');

  await openSettings(win);
  const [filechooser] = await Promise.all([
    win.waitForEvent('filechooser'),
    win.getByText('导入数据 (JSON)', { exact: true }).click(),
  ]);
  await filechooser.setFiles(tmp);

  const dialog = await dialogPromise;
  expect(dialog.message()).toContain('导入失败');
  await dialog.accept();
});
