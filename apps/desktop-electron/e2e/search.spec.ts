/**
 * 全局搜索：跨项目结果、清除按钮、Ctrl+F 聚焦与项目跳转。
 */
import { test, expect } from '@playwright/test';
import {
  launchApp,
  closeApp,
  addTodo,
  createProject,
  projectRow,
  todoRow,
  type LaunchedApp,
} from './helpers';

let appInfo: LaunchedApp;
let win: Awaited<ReturnType<typeof launchApp>>['window'];

test.beforeEach(async () => {
  appInfo = await launchApp();
  win = appInfo.window;
  // 首启无默认项目，先建一个项目再造数据
  await createProject(win, '测试项目');
  await addTodo(win, '买苹果');
  await addTodo(win, '买香蕉');
  await addTodo(win, '写报告');
});

test.afterEach(async () => {
  await closeApp(appInfo);
});

async function openSearch() {
  await win.getByRole('button', { name: '搜索所有项目中的事项' }).click();
  return win.getByPlaceholder('搜索所有项目中的事项...');
}

test('输入关键词后展示跨项目结果，不改变当前项目列表', async () => {
  await createProject(win, '另一个项目');
  await addTodo(win, '跨项目周报');
  await projectRow(win, '测试项目').click();
  const search = await openSearch();
  await search.fill('周报');
  // 结果项的可访问名包含事项标题与所属项目名；限定在 option 上避免与侧边栏项目行撞名。
  const option = win.getByRole('option', { name: /跨项目周报/ });
  await expect(option).toBeVisible();
  await expect(option).toContainText('另一个项目');
  // 当前项目列表不受搜索影响，仍展示原内容。
  await expect(todoRow(win, '买香蕉')).toBeVisible();
});

test('清除按钮清空搜索', async () => {
  const search = await openSearch();
  await search.fill('苹果');
  await win.getByRole('button', { name: '清除搜索' }).click();
  await expect(search).toHaveValue('');
  // 清空不会影响当前项目列表
  await expect(todoRow(win, '买香蕉')).toBeVisible();
});

test('选中结果后切换项目并定位事项', async () => {
  await createProject(win, '另一个项目');
  await addTodo(win, '跨项目周报');
  await projectRow(win, '测试项目').click();
  const search = await openSearch();
  await search.fill('周报');
  await win.getByRole('option', { name: /跨项目周报/ }).click();
  await expect(win.getByRole('heading', { name: '另一个项目', level: 1 })).toBeVisible();
  // 跳转后下拉清空，事项仅在当前列表中：todoRow 锚定到行容器，避免与历史 option 文本撞名。
  await expect(todoRow(win, '跨项目周报')).toBeVisible();
});
