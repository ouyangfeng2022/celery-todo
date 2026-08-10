/**
 * 时间视图：无项目快速添加、唯一收集箱、跨项目移动与每周模板。
 */
import { test, expect } from '@playwright/test';
import { closeApp, createProject, launchApp, type LaunchedApp } from './helpers';

let appInfo: LaunchedApp;
let win: Awaited<ReturnType<typeof launchApp>>['window'];

test.beforeEach(async () => {
  appInfo = await launchApp();
  win = appInfo.window;
});

test.afterEach(async () => {
  await closeApp(appInfo);
});

async function switchNavigation(mode: '项目' | '时间'): Promise<void> {
  await win.getByLabel('事项分类方式').getByRole('button', { name: mode, exact: true }).click();
}

test('全新安装无需项目即可添加，并按需创建且复用唯一收集箱', async () => {
  await switchNavigation('时间');
  await expect(win.getByRole('heading', { name: '今天', level: 1 })).toBeVisible();

  const input = win.getByLabel('新事项标题');
  await input.fill('直接收集一');
  await input.press('Enter');
  await expect(win.getByText('直接收集一', { exact: true })).toBeVisible();

  await input.fill('直接收集二');
  await input.press('Enter');
  await expect(win.getByText('直接收集二', { exact: true })).toBeVisible();

  await switchNavigation('项目');
  await expect(win.getByRole('button', { name: '收集箱', exact: true })).toHaveCount(1);
  await expect(win.getByRole('heading', { name: '收集箱', level: 1 })).toBeVisible();
  await expect(win.getByText('直接收集一', { exact: true })).toBeVisible();
  await expect(win.getByText('直接收集二', { exact: true })).toBeVisible();
});

test('时间事项可指定普通项目，也可从收集箱移动到目标项目末尾', async () => {
  await createProject(win, '工作');
  await switchNavigation('时间');

  const target = win.getByLabel('新事项所属项目');
  await target.selectOption({ label: '工作' });
  await win.getByLabel('新事项标题').fill('直接归入工作');
  await win.getByLabel('新事项标题').press('Enter');
  await expect(win.getByText('直接归入工作', { exact: true })).toBeVisible();

  await target.selectOption({ label: '收集箱' });
  await win.getByLabel('新事项标题').fill('稍后归类');
  await win.getByLabel('新事项标题').press('Enter');
  await expect(win.getByText('稍后归类', { exact: true })).toBeVisible();

  await win.getByLabel('移动“稍后归类”到项目').selectOption({ label: '工作' });
  await switchNavigation('项目');
  await win.getByRole('button', { name: '工作（拖动以排序）' }).click();
  await expect(win.getByText('直接归入工作', { exact: true })).toBeVisible();
  await expect(win.getByText('稍后归类', { exact: true })).toBeVisible();
});

test('每周计划模板原子创建普通项目和八条事项', async () => {
  await win.getByRole('button', { name: '从模板新建项目' }).click();
  const dialog = win.getByRole('dialog', { name: '项目模板' });
  await expect(dialog).toBeVisible();

  const projectName = await dialog.getByLabel('项目名称').inputValue();
  const startDate = await dialog.getByLabel('起始日期').inputValue();
  await dialog.getByRole('button', { name: '创建项目', exact: true }).click();

  await expect(win.getByRole('heading', { name: projectName, level: 1 })).toBeVisible();
  for (const title of [
    '周一待办',
    '周二待办',
    '周三待办',
    '周四待办',
    '周五待办',
    '周六待办',
    '周日待办',
    '每周复盘',
  ]) {
    await expect(win.getByText(title, { exact: true })).toBeVisible();
  }
  await expect(win.getByText(startDate, { exact: true }).first()).toBeVisible();
});
