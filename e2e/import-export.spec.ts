/**
 * 导入导出：项目 JSON / 全量 JSON / CSV / 导入 / 非法导入。
 *
 * 注意：导出走 renderer <a download>，用 page.waitForEvent('download') 捕获。
 *      导入走动态创建的 <input type=file>，用 page.waitForEvent('filechooser') 捕获。
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launchApp,
  closeApp,
  addTodo,
  createProject,
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

  const projectBtn = win.getByRole('button', { name: '导出测试（拖动以排序）' }).first();
  const projectRow = projectBtn.locator('xpath=ancestor::div[contains(@class,"group")][1]');
  await projectRow.hover();
  await projectRow.getByRole('button', { name: '导出项目' }).click();

  const dl = await getLastDownload(win);
  expect(dl.filename).toBe('导出测试-export.json');
  const data = JSON.parse(decodeUtf8(dl.content));
  expect(data.version).toBe(3);
  expect(data.project.name).toBe('导出测试');
  expect(data.todos.some((t: { title: string }) => t.title === '被导出任务')).toBe(true);
});

test('导出全部数据为 JSON，文件名含日期', async () => {
  await installDownloadCapture(win);
  await createProject(win, '全量导出项目');
  await addTodo(win, '全量任务');
  await openSettingsSection(win, '数据');

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
  await createProject(win, 'CSV导出项目');
  await addTodo(win, 'CSV任务');
  await openSettingsSection(win, '数据');

  await win.getByText('导出当前项目 (CSV)', { exact: true }).click();
  const dl = await getLastDownload(win);

  expect(dl.filename).toBe('todos-CSV导出项目.csv');
  // UTF-8 BOM：第一个字节应为 0xEF（BOM = EF BB BF）
  expect(dl.content.charCodeAt(0)).toBe(0xef);
  // 解码后中文表头与任务行
  const text = decodeUtf8(dl.content);
  expect(text).toContain('标题,描述,已完成,优先级,创建时间,完成时间,置顶');
  expect(text).toContain('CSV任务');
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

  // 默认项目应含"全量导入的任务1"（importAllData 是异步的，给足等待）
  await expect(win.getByText('全量导入的任务1', { exact: true })).toBeVisible({ timeout: 10_000 });
  // 切换到"导入的项目"看到其 todo
  await win.getByRole('button', { name: '导入的项目（拖动以排序）' }).first().click();
  await expect(win.getByText('导入项目的任务', { exact: true })).toBeVisible();
});

test('导入单个项目后新建该项目并自动切换', async () => {
  await openSettingsSection(win, '数据');
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
