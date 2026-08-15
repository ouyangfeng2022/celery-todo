/**
 * 导入导出：项目 JSON / 全量 JSON / Excel / 导入 / 非法导入。
 *
 * 注意：导出走 renderer <a download>，用 page.waitForEvent('download') 捕获。
 *      导入走动态创建的 <input type=file>，用 page.waitForEvent('filechooser') 捕获。
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import {
  launchApp,
  closeApp,
  addTodo,
  createProject,
  openProjectContextMenu,
  openSettingsSection,
  installDownloadCapture,
  getLastDownload,
  decodeUtf8,
  type LaunchedApp,
} from './helpers';

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

test('导出单个项目为 JSON，文件名与结构正确', async () => {
  await installDownloadCapture(win);
  await createProject(win, '导出测试');
  await addTodo(win, '被导出任务');

  // 所有入口都打开同一张导出选项卡；项目右键会预选当前项目。
  await openProjectContextMenu(win, '导出测试');
  await win.getByRole('button', { name: '导出…', exact: true }).click();
  await expect(win.getByRole('dialog', { name: '导出' })).toBeVisible();
  await win.getByRole('button', { name: '预览', exact: true }).click();
  await expect(win.getByRole('dialog', { name: 'JSON 备份预览' })).toBeVisible();
  await win.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(win.getByRole('dialog', { name: '导出' })).toBeVisible();
  await win.getByRole('button', { name: '预览', exact: true }).click();
  await win
    .getByRole('dialog', { name: 'JSON 备份预览' })
    .getByRole('button', { name: '导出', exact: true })
    .click();

  const dl = await getLastDownload(win);
  expect(dl.filename).toBe('Celery-Todo-导出测试.json');
  const data = JSON.parse(decodeUtf8(dl.content));
  // 需与 src/utils/export.ts 的 EXPORT_FORMAT_VERSION 保持一致（当前 6）。
  expect(data.version).toBe(6);
  expect(data.project.name).toBe('导出测试');
  expect(data.todos.some((t: { title: string }) => t.title === '被导出任务')).toBe(true);
});

test('导出全部数据为 JSON，文件名含日期', async () => {
  await installDownloadCapture(win);
  await createProject(win, '全量导出项目');
  await addTodo(win, '全量任务');
  await openSettingsSection(win, '数据');

  await win.getByText('导出数据…', { exact: true }).click();
  // 设置页的导出入口默认选择「全部项目」。
  await expect(win.getByRole('dialog', { name: '导出' })).toBeVisible();
  await win.getByRole('button', { name: '导出', exact: true }).click();
  const dl = await getLastDownload(win);

  const today = new Date().toISOString().slice(0, 10);
  expect(dl.filename).toBe(`Celery-Todo-All-${today}.json`);
  const data = JSON.parse(decodeUtf8(dl.content));
  expect(Array.isArray(data.projects)).toBe(true);
  expect(Array.isArray(data.todos)).toBe(true);
  expect(data.todos.some((t: { title: string }) => t.title === '全量任务')).toBe(true);
});

test('全量导出为 Excel 时每个项目对应一个工作表', async () => {
  await installDownloadCapture(win);
  await createProject(win, '工作');
  await addTodo(win, '完成报告');
  await createProject(win, '生活');
  await addTodo(win, '购买食材');
  await createProject(win, '健康');
  await addTodo(win, '晨跑');
  await createProject(win, '阅读');
  await addTodo(win, '阅读计划');
  await openSettingsSection(win, '数据');

  await win.getByText('导出数据…', { exact: true }).click();
  await win.getByRole('button', { name: /Excel 工作簿/ }).click();
  await win.getByRole('button', { name: '预览', exact: true }).click();
  await expect(win.getByRole('dialog', { name: 'Excel 工作簿预览' })).toBeVisible();
  const excelPreview = win.getByRole('dialog', { name: 'Excel 工作簿预览' });
  await expect(excelPreview.getByText('Sheet · 工作', { exact: true })).toBeVisible();
  await expect(excelPreview.getByText('Sheet · 生活', { exact: true })).toBeVisible();
  await expect(excelPreview.getByText('Sheet · 健康', { exact: true })).toBeVisible();
  await expect(excelPreview.getByText('Sheet · 阅读', { exact: true })).toHaveCount(0);
  await excelPreview.getByRole('button', { name: '导出', exact: true }).click();

  const dl = await getLastDownload(win);
  expect(dl.filename).toMatch(/^Celery-Todo-All-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const bytes = new Uint8Array([...dl.content].map((char) => char.charCodeAt(0)));
  const workbook = XLSX.read(bytes, { type: 'array' });
  expect(workbook.SheetNames).toEqual(expect.arrayContaining(['工作', '生活']));
  expect(XLSX.utils.sheet_to_json<string[]>(workbook.Sheets['工作'], { header: 1 })[1][0]).toBe(
    '完成报告',
  );
  expect(XLSX.utils.sheet_to_json<string[]>(workbook.Sheets['生活'], { header: 1 })[1][0]).toBe(
    '购买食材',
  );
  expect(XLSX.utils.sheet_to_json<string[]>(workbook.Sheets['阅读'], { header: 1 })[1][0]).toBe(
    '阅读计划',
  );
});

test('导出当前项目为 Excel，文件结构正确', async () => {
  await installDownloadCapture(win);
  await createProject(win, 'CSV导出项目');
  await addTodo(win, 'CSV任务');
  await openSettingsSection(win, '数据');

  // 设置页也使用同一张导出选项卡；切换为单个项目后可选择 Excel。
  await win.getByText('导出数据…', { exact: true }).click();
  await expect(win.getByRole('dialog', { name: '导出' })).toBeVisible();
  await win.getByRole('button', { name: '单个项目 选择一个项目及其事项' }).click();
  await win.getByRole('button', { name: /Excel 工作簿/ }).click();
  await win.getByRole('button', { name: '预览', exact: true }).click();
  await expect(win.getByRole('dialog', { name: 'Excel 工作簿预览' })).toBeVisible();
  await win
    .getByRole('dialog', { name: 'Excel 工作簿预览' })
    .getByRole('button', { name: '导出', exact: true })
    .click();

  const dl = await getLastDownload(win);
  expect(dl.filename).toBe('Celery-Todo-CSV导出项目.xlsx');
  // XLSX 是 ZIP 容器，文件头为 PK。
  expect(dl.content.slice(0, 2)).toBe('PK');
});

test('导出当前项目为 PNG 时跳过可见预览并直接下载', async () => {
  await installDownloadCapture(win);
  await createProject(win, '图片导出项目');
  await addTodo(win, '图片任务');

  await openProjectContextMenu(win, '图片导出项目');
  await win.getByRole('button', { name: '导出…', exact: true }).click();
  await win.getByRole('button', { name: /PNG 图片/ }).click();
  await win.getByRole('button', { name: '导出', exact: true }).click();

  await expect(win.getByRole('dialog', { name: '导出为图片' })).toHaveCount(0);
  const dl = await getLastDownload(win);
  expect(dl.filename).toBe('Celery-Todo-图片导出项目.png');
  expect(dl.content.slice(0, 8)).toBe('\x89PNG\r\n\x1a\n');
});

test('导入完整应用数据后项目和 todo 都出现', async () => {
  await openSettingsSection(win, '数据');
  const [filechooser] = await Promise.all([
    win.waitForEvent('filechooser'),
    win.getByText('导入数据 (JSON)', { exact: true }).click(),
  ]);
  await filechooser.setFiles(path.join(FIXTURES, 'import-full.json'));
  // 关闭设置面板，否则遮罩拦截后续点击
  await win.keyboard.press('Escape');
  await expect(win.getByRole('region', { name: '设置' })).toHaveCount(0);

  // 导入会恢复备份中的 lastActiveProjectId（importAllData 是异步的，给足等待）
  await expect(win.getByText('导入项目的任务', { exact: true })).toBeVisible({ timeout: 10_000 });
  // 切到默认项目后也能看到其 todo，确认全量数据均已替换导入
  await win.getByRole('button', { name: '默认项目（拖动以排序）' }).first().click();
  await expect(win.getByText('全量导入的任务1', { exact: true })).toBeVisible();
});

test('导入单个项目后新建该项目并自动切换', async () => {
  await openSettingsSection(win, '数据');
  const [filechooser] = await Promise.all([
    win.waitForEvent('filechooser'),
    win.getByText('导入数据 (JSON)', { exact: true }).click(),
  ]);
  await filechooser.setFiles(path.join(FIXTURES, 'import-project.json'));

  await expect(win.getByRole('button', { name: '单项目导入（拖动以排序）' }).first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(win.getByText('单项目导入的任务', { exact: true })).toBeVisible();
});

test('导入非法 JSON 弹出 alert 含"导入失败"', async () => {
  const fs = await import('node:fs');
  const tmp = path.join(appInfo.userData, 'bad.json');
  fs.writeFileSync(tmp, '{ not valid json');

  // 用 onceAndWait 模式：捕获第一个 dialog 并在测试内同步 accept，
  // 避免与 afterEach 的 closeApp 竞态。
  const dialogPromise = win.waitForEvent('dialog');

  await openSettingsSection(win, '数据');
  const [filechooser] = await Promise.all([
    win.waitForEvent('filechooser'),
    win.getByText('导入数据 (JSON)', { exact: true }).click(),
  ]);
  await filechooser.setFiles(tmp);

  const dialog = await dialogPromise;
  expect(dialog.message()).toContain('导入失败');
  await dialog.accept();
});
