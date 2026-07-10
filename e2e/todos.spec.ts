/**
 * Todo 核心 CRUD：添加、批量、完成、编辑、删除、优先级、截止日期、描述 Markdown。
 */
import { test, expect } from '@playwright/test';
import { launchApp, closeApp, addTodo, addTodosBulk, createProject, todoRow, type LaunchedApp } from './helpers';

let appInfo: LaunchedApp;
let win: Awaited<ReturnType<typeof launchApp>>['window'];

test.beforeEach(async () => {
  appInfo = await launchApp();
  win = appInfo.window;
  // 首启无默认项目，每个用例先建一个项目承载 todo
  await createProject(win, '测试项目');
});

test.afterEach(async () => {
  await closeApp(appInfo);
});

test('添加单条 todo 后出现在列表中', async () => {
  await addTodo(win, '买菜');
  await expect(win.getByText('买菜', { exact: true })).toBeVisible();
});

test('Enter 提交后输入框清空', async () => {
  const input = win.getByPlaceholder('添加待办事项...（按 Shift+Enter 换行可批量添加）');
  await input.fill('测试任务');
  await win.keyboard.press('Enter');
  await expect(input).toHaveValue('');
});

test('Shift+Enter 批量添加多行 todo', async () => {
  await addTodosBulk(win, ['任务A', '任务B', '任务C']);
  await expect(win.getByText('任务A', { exact: true })).toBeVisible();
  await expect(win.getByText('任务B', { exact: true })).toBeVisible();
  await expect(win.getByText('任务C', { exact: true })).toBeVisible();
});

test('点击完成按钮标记完成，再次点击取消', async () => {
  await addTodo(win, '完成的任务');
  const row = todoRow(win, '完成的任务');
  await row.hover();

  // 未完成时按钮文案是"标记为已完成"
  const completeBtn = row.getByRole('button', { name: '标记为已完成' });
  await completeBtn.click();

  // 完成后文案变为"标记为未完成"
  await expect(row.getByRole('button', { name: '标记为未完成' })).toBeVisible();

  // 再次点击取消
  await row.getByRole('button', { name: '标记为未完成' }).click();
  await expect(row.getByRole('button', { name: '标记为已完成' })).toBeVisible();
});

test('双击标题进入编辑，修改后保存生效', async () => {
  await addTodo(win, '原标题');
  // 双击标题进入编辑
  await win.getByText('原标题', { exact: true }).dblclick();

  // 编辑态有"事项标题" placeholder 的 textarea
  const titleEditor = win.getByPlaceholder('事项标题');
  await expect(titleEditor).toBeVisible();
  await titleEditor.fill('新标题');
  // Ctrl+Enter 保存
  await win.keyboard.press('Control+Enter');

  await expect(win.getByText('新标题', { exact: true })).toBeVisible();
  await expect(win.getByText('原标题', { exact: true })).toHaveCount(0);
});

test('编辑时 Esc 取消，保留原值', async () => {
  await addTodo(win, '保留原文');
  await win.getByText('保留原文', { exact: true }).dblclick();
  const titleEditor = win.getByPlaceholder('事项标题');
  await titleEditor.fill('被取消的修改');
  await win.keyboard.press('Escape');

  await expect(win.getByText('保留原文', { exact: true })).toBeVisible();
  await expect(win.getByText('被取消的修改')).toHaveCount(0);
});

test('编辑态点"保存"按钮也能保存', async () => {
  await addTodo(win, '点按钮保存');
  await win.getByText('点按钮保存', { exact: true }).dblclick();
  await win.getByPlaceholder('事项标题').fill('已保存');
  // 点编辑区右下角"保存"按钮
  await win.getByRole('button', { name: '保存', exact: true }).click();
  await expect(win.getByText('已保存', { exact: true })).toBeVisible();
});

test('编辑态可填写描述，渲染 Markdown', async () => {
  await addTodo(win, '带描述的任务');
  await win.getByText('带描述的任务', { exact: true }).dblclick();
  await win
    .getByPlaceholder('描述（支持 Markdown：**粗体** *斜体* `代码` [链接](url)）')
    .fill('**重要** 内容');
  await win.keyboard.press('Control+Enter');

  // Markdown 渲染为 <strong>重要</strong>
  await expect(win.getByText('重要').locator('xpath=ancestor-or-self::strong')).toBeVisible();
});

test('删除按钮把 todo 归档到历史记录（从列表消失）', async () => {
  await addTodo(win, '要删除的任务');
  const row = todoRow(win, '要删除的任务');
  await row.hover();
  await row.getByRole('button', { name: '删除', exact: true }).click();

  await expect(win.getByText('要删除的任务', { exact: true })).toHaveCount(0);
});

test('添加时设置优先级（高），列表中显示"高"标签', async () => {
  await addTodo(win, '高优先级任务', { priority: '高' });
  // claude-tag 文案"高"可见。注意"添加"区也有"高"按钮，但 AddTodoInput 提交后会收起
  // 故列表中应能找到 claude-tag"高"
  await expect(win.locator('.claude-tag', { hasText: '高' }).first()).toBeVisible();
});

test('添加时设置截止日期，列表中显示日期标签', async () => {
  const future = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
  await addTodo(win, '有截止的任务', { dueDate: future });
  // 截止日期标签内含 CalendarIcon + 格式化日期文案；至少能找到该 todo 行里的 claude-tag
  const row = todoRow(win, '有截止的任务');
  await expect(row.locator('.claude-tag').first()).toBeVisible();
});

test('行内设置优先级菜单：从"中"切到"高"', async () => {
  await addTodo(win, '行内改优先级');
  const row = todoRow(win, '行内改优先级');
  await row.hover();
  // 点击"设置优先级"按钮触发下拉菜单
  await row.getByRole('button', { name: '设置优先级' }).click();
  await win.getByText('高优先级', { exact: true }).click();
  // 列表内出现"高"标签
  await expect(row.locator('.claude-tag', { hasText: '高' })).toBeVisible();
});
