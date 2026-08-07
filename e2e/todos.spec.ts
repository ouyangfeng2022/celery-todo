/**
 * Todo 核心 CRUD：添加、批量、完成、编辑、删除、优先级、描述 Markdown。
 */
import { test, expect } from '@playwright/test';
import { launchApp, closeApp, addTodo, addTodosBulk, createProject, todoRow, getTodoTitlesInOrder, type LaunchedApp } from './helpers';

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
  const input = win.getByLabel('新事项标题');
  await input.fill('测试任务');
  await win.keyboard.press('Enter');
  await expect(input).toHaveValue('');
});

test('按需展开描述并在创建时渲染 Markdown', async () => {
  const titleInput = win.getByLabel('新事项标题');

  // 默认保持单行简洁，不渲染描述输入区
  await expect(win.getByLabel('新事项描述')).toHaveCount(0);
  await titleInput.fill('创建时带描述');
  await win.getByRole('button', { name: '添加描述' }).click();

  const descriptionInput = win.getByLabel('新事项描述');
  await expect(descriptionInput).toBeFocused();
  await descriptionInput.fill('**重要** 内容');
  await win.keyboard.press('Control+Enter');

  const row = todoRow(win, '创建时带描述');
  await expect(row.getByRole('button', { name: '**重要** 内容' })).toBeVisible();
  await row.getByRole('button', { name: '**重要** 内容' }).click();
  await expect(win.getByText('重要').locator('xpath=ancestor-or-self::strong')).toBeVisible();
  await expect(titleInput).toHaveValue('');
  await expect(win.getByLabel('新事项描述')).toHaveCount(0);
});

test('Esc 收起描述后保留当前项目草稿', async () => {
  const titleInput = win.getByLabel('新事项标题');
  await titleInput.fill('尚未提交');
  await win.getByRole('button', { name: '添加描述' }).click();
  await win.getByLabel('新事项描述').fill('保留这段 **Markdown**');

  await win.keyboard.press('Escape');
  await expect(win.getByLabel('新事项描述')).toHaveCount(0);
  await expect(win.getByRole('button', { name: '已添加描述' })).toBeVisible();

  await win.getByRole('button', { name: '已添加描述' }).click();
  await expect(win.getByLabel('新事项描述')).toHaveValue('保留这段 **Markdown**');
  await expect(titleInput).toHaveValue('尚未提交');
});

test('Shift+Enter 批量添加多行 todo', async () => {
  await addTodosBulk(win, ['任务A', '任务B', '任务C']);
  await expect(win.getByText('任务A', { exact: true })).toBeVisible();
  await expect(win.getByText('任务B', { exact: true })).toBeVisible();
  await expect(win.getByText('任务C', { exact: true })).toBeVisible();
});

test('批量输入时禁用统一描述', async () => {
  const titleInput = win.getByLabel('新事项标题');
  await titleInput.click();
  await titleInput.fill('任务A\n任务B');

  const descriptionButton = win.getByRole('button', { name: '批量添加不支持描述' });
  await expect(descriptionButton).toBeDisabled();
  await expect(win.getByLabel('新事项描述')).toHaveCount(0);
});

test('点击完成按钮标记完成，再次点击取消', async () => {
  // 用两条 todo：完成其一不会触发「全部搞定」（需要全部完成才庆祝），
  // 行内完成/取消按钮才始终可见，可验证 toggle 行为。
  await addTodosBulk(win, ['任务A', '任务B']);
  const row = todoRow(win, '任务A');
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

test('全部完成后显示「全部搞定」，点击对号归档回到空状态', async () => {
  await addTodo(win, '唯一的任务');
  const row = todoRow(win, '唯一的任务');
  await row.hover();

  // 完成最后一项 → 触发「全部搞定」庆祝卡片（行内 toggle 按钮随列表消失）
  await row.getByRole('button', { name: '标记为已完成' }).click();

  // 庆祝卡片标题可见，且不再叠加「从一件小事开始」空状态
  await expect(win.getByRole('heading', { name: '全部搞定' })).toBeVisible();
  await expect(win.getByRole('heading', { name: '从一件小事开始' })).toHaveCount(0);

  // 点击对号徽标 → 归档已完成项 → 项目变空 → 自然回到空状态
  await win.getByRole('button', { name: '归档已完成事项，返回首页' }).click();
  await expect(win.getByRole('heading', { name: '从一件小事开始' })).toBeVisible();
  await expect(win.getByRole('heading', { name: '全部搞定' })).toHaveCount(0);
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
  await win.getByLabel('事项描述').fill('**重要** 内容');
  await win.keyboard.press('Control+Enter');

  // 默认只显示纯文本摘要；点击后再按需加载 Markdown。
  const row = todoRow(win, '带描述的任务');
  await row.getByRole('button', { name: '**重要** 内容' }).click();
  await expect(win.getByText('重要').locator('xpath=ancestor-or-self::strong')).toBeVisible();
});

test('归档按钮把 todo 归档到历史记录（从列表消失）', async () => {
  await addTodo(win, '要归档的任务');
  const row = todoRow(win, '要归档的任务');
  await row.hover();
  await row.getByRole('button', { name: '归档', exact: true }).click();

  await expect(win.getByText('要归档的任务', { exact: true })).toHaveCount(0);
});

test('添加时设置优先级（高），列表中显示"高"标签', async () => {
  await addTodo(win, '高优先级任务', { priority: '高' });
  // claude-tag 文案"高"可见。注意"添加"区也有"高"按钮，但 AddTodoInput 提交后会收起
  // 故列表中应能找到 claude-tag"高"
  await expect(win.locator('.claude-tag', { hasText: '高' }).first()).toBeVisible();
});

test('行内设置优先级菜单：从"中"切到"高"', async () => {
  await addTodo(win, '行内改优先级');
  const row = todoRow(win, '行内改优先级');
  // 点击元信息行的“中”优先级标签触发下拉菜单（标签始终可见，无需 hover）
  await row.getByRole('button', { name: '设置优先级' }).click();
  // 等待下拉动画完成，再点击菜单项（role=menuitemradio 避免与 AddTodoInput 的“高”按钮歧义）
  const highItem = win.getByRole('menuitemradio', { name: '高' });
  await highItem.waitFor({ state: 'visible' });
  await highItem.click();
  // 列表内出现"高"标签
  await expect(row.locator('.claude-tag', { hasText: '高' })).toBeVisible();
});

test('置顶：点击置顶按钮后该项浮到列表最前，并显示"置顶"标签', async () => {
  // 默认排序为「创建时间 ↓」（新在上）。先建 A 再建 B，B 自然在前；
  // 对 A 置顶后期望 A 反超 B 排到第一位，验证置顶优先于默认排序。
  await addTodo(win, '普通事项A');
  await addTodo(win, '普通事项B');

  const row = todoRow(win, '普通事项A');
  await row.hover();
  await row.getByRole('button', { name: '置顶' }).click();

  // 行内出现"置顶"标签
  await expect(row.locator('.claude-tag', { hasText: '置顶' })).toBeVisible();

  // 置顶项应反超到列表第一位
  const order = await getTodoTitlesInOrder(win);
  expect(order[0]).toBe('普通事项A');
});

test('取消置顶：再次点击后"置顶"标签消失', async () => {
  await addTodo(win, '可切换置顶');
  const row = todoRow(win, '可切换置顶');
  await row.hover();
  await row.getByRole('button', { name: '置顶' }).click();
  await expect(row.locator('.claude-tag', { hasText: '置顶' })).toBeVisible();

  // 再点一次（此时按钮 aria-label 变为「取消置顶」）
  await row.hover();
  await row.getByRole('button', { name: '取消置顶' }).click();
  await expect(row.locator('.claude-tag', { hasText: '置顶' })).toHaveCount(0);
});
