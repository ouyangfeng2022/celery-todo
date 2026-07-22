/**
 * E2E 公共工具：启动真实 Electron 和通用操作。
 *
 * 数据隔离：每个 launchApp() 用 fs.mkdtempSync 生成独立临时 userData 目录，
 * 通过 CELERY_TODO_USERDATA 环境变量传给主进程（main.ts 顶部钩子读取）。
 */
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
let launchCounter = 0;

export interface LaunchedApp {
  app: ElectronApplication;
  window: Page;
  userData: string;
}

/**
 * 关闭 Electron 应用：直接 kill 进程树。
 *
 * 不用 app.close()：Windows 上托盘/IPC/单实例的清理路径偶发挂起，
 * close 的优雅退出在串行测试里会累积风险。直接 taskkill 进程树更可靠，
 * 每个测试用独立 userData，进程被杀也不会丢用户数据。
 */
export async function closeApp(appInfo: LaunchedApp | undefined): Promise<void> {
  if (!appInfo) return;
  const proc = appInfo.app.process();
  const pid = proc?.pid;

  if (pid) {
    try {
      const { execSync } = await import('node:child_process');
      if (process.platform === 'win32') {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
      } else {
        try {
          process.kill(-pid, 9); // 进程组
        } catch {
          process.kill(pid, 9);
        }
      }
    } catch {
      // 进程可能已退出
    }
  }

  // 给系统一拍释放文件句柄/命名管道，避免下一个 launchApp 撞上残留
  await new Promise((resolve) => setTimeout(resolve, 400));

  // 清理临时 userData 目录，避免大量累积拖慢文件系统（Windows 临时目录过载时
  // 会让后续 mkdtemp / 文件加载显著变慢，表现为冷启动 flaky）
  try {
    fs.rmSync(appInfo.userData, { recursive: true, force: true });
  } catch {
    // 偶有句柄未释放导致删除失败，忽略；CI 上系统清理即可
  }
}

export async function launchApp(): Promise<LaunchedApp> {
  // 独立的 userData 目录彻底隔离：DB / window-state.json / 单实例锁互不干扰
  // 用 counter + pid 保证唯一，避免 Date.now 在快速串行时碰撞
  const userData = path.join(
    os.tmpdir(),
    `celery-e2e-${process.pid}-${launchCounter++}-${Date.now()}`,
  );
  fs.mkdirSync(userData, { recursive: true });

  const app = await electron.launch({
    args: [projectRoot], // 加载 package.json:main → dist-electron/main.js
    cwd: projectRoot,
    env: { ...process.env, CELERY_TODO_USERDATA: userData },
    timeout: 30_000,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // 收集控制台错误便于排查冷启动问题
  const consoleErrors: string[] = [];
  window.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  const pageErrors: string[] = [];
  window.on('pageerror', (err) => pageErrors.push(String(err)));

  // 先等 React 根节点挂载（body 有子节点），避免空 body 导致后续定位全失败。
  await window.waitForFunction(
    () => document.body && document.body.children.length > 0,
    undefined,
    { timeout: 30_000 },
  );

  // 等应用首屏挂载完成：dbReady 后主视图才渲染（含 <main>）。
  // initDatabase 需要加载 sql-wasm.wasm，CI / 多实例串行下冷启动可能慢。
  try {
    await window.locator('main').waitFor({ state: 'attached', timeout: 45_000 });
  } catch {
    // 超时时抓诊断信息（loading 卡住 / wasm 失败 / 空白页）便于排查
    let diag = '(无法读取 body)';
    try {
      diag = await window.evaluate(() => document.body.innerHTML.slice(0, 500));
    } catch {
      // 忽略
    }
    throw new Error(
      `应用启动超时（<main> 未渲染）。console errors: ${consoleErrors.join(' | ')}; page errors: ${pageErrors.join(' | ')}; body: ${diag}`,
    );
  }
  // dbReady 后 React 还要跑 loadProjects/loadTodo 的 effect，再等一拍
  await window.waitForTimeout(800);

  return { app, window, userData };
}

/** 等待 SQLite debounce 保存（scheduleSave 500ms）落盘 */
export function waitForSave(win: Page): Promise<void> {
  return win.waitForTimeout(700);
}

/** 强制 flushSave（Ctrl+S）后等保存完成 */
export async function flushAndSave(win: Page): Promise<void> {
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(200);
}

/**
 * 添加单条 todo。返回创建后的行 locator。
 */
export async function addTodo(
  win: Page,
  title: string,
  options?: { priority?: '高' | '中' | '低' },
): Promise<ReturnType<Page['getByText']>> {
  const input = win.getByPlaceholder('添加待办事项...（按 Shift+Enter 换行可批量添加）');
  await input.click();

  if (options?.priority) {
    // 优先级按钮在 AddTodoInput 的展开区，文案"高/中/低"
    await win.getByText(options.priority, { exact: true }).click();
  }

  await input.fill(title);
  await win.keyboard.press('Enter');
  const row = win.getByText(title).first();
  await row.waitFor({ state: 'visible' });
  return row;
}

/**
 * 批量添加（textarea 内换行触发 addTodosBulk）。
 */
export async function addTodosBulk(win: Page, titles: string[]): Promise<void> {
  const input = win.getByPlaceholder('添加待办事项...（按 Shift+Enter 换行可批量添加）');
  await input.click();
  await input.fill(titles.join('\n'));
  await win.keyboard.press('Enter');
  for (const t of titles) {
    await win.getByText(t).first().waitFor({ state: 'visible' });
  }
}

/**
 * 定位某条 todo 的整行容器（TodoItem 根 div 含 "group" class）。
 * 用于在行范围内查找完成按钮、删除按钮等。
 */
export function todoRow(win: Page, title: string) {
  return win
    .getByText(title, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"group")][1]');
}

/** 完成/取消完成按钮 */
export function toggleButton(row: ReturnType<Page['locator']>) {
  return row.getByRole('button', { name: /标记为/ });
}

/** 归档按钮（行内动作栏，悬浮显示） */
export function archiveButton(row: ReturnType<Page['locator']>) {
  return row.getByRole('button', { name: '归档', exact: true });
}

/** 编辑按钮 */
export function editButton(row: ReturnType<Page['locator']>) {
  return row.getByRole('button', { name: '编辑', exact: true });
}

/** 让悬浮才显示的动作栏按钮可点击：先 hover 行 */
export async function hoverRow(row: ReturnType<Page['locator']>): Promise<void> {
  await row.hover();
}

/** 打开设置面板（侧边栏底部"设置"按钮，需 exact 避开行内"设置优先级"按钮） */
export async function openSettings(win: Page): Promise<void> {
  await win.getByRole('button', { name: '设置', exact: true }).click();
  await win.getByRole('heading', { name: '设置' }).waitFor({ state: 'visible' });
}

/**
 * 打开设置面板并切到指定子页面（左侧分类导航）。默认进入「通用」，
 * 数据导入/导出/重置等在「数据」下，需先切过去再操作对应按钮/文案。
 */
export async function openSettingsSection(win: Page, section: string): Promise<void> {
  await openSettings(win);
  await win.getByRole('button', { name: section, exact: true }).click();
}

/**
 * 打开「历史记录」（归档）弹窗：点侧边栏「历史记录」按钮唤出独立弹窗。
 * 等弹窗标题「历史记录」与副标题同时可见，即视为加载完成。
 */
export async function openHistory(win: Page): Promise<void> {
  await win.getByRole('button', { name: '历史记录', exact: true }).click();
  // 弹窗标题 + 历史视图副标题同时可见
  await win.getByRole('heading', { name: '历史记录' }).waitFor({ state: 'visible' });
  await win
    .getByText('归档的事项会保存在此处，可在任意时间恢复或永久删除。')
    .waitFor({ state: 'visible' });
}

/** 新建项目并自动切换到它 */
export async function createProject(win: Page, name: string): Promise<void> {
  await win.getByRole('button', { name: '新建项目' }).click();
  const input = win.getByPlaceholder('项目名称...');
  await input.fill(name);
  await win.keyboard.press('Enter');
  // createProject 后自动切换 → Header 标题更新
  await win.getByRole('heading', { name, level: 1 }).waitFor({ state: 'visible' });
  // 等 App.tsx 的 activeProjectId effect 跑完 loadProject（设置 currentProjectId），
  // 否则紧接着的 addTodo 可能写到旧项目。EmptyState 出现 = 新项目已加载且为空。
  await win.waitForTimeout(400);
}

/** 获取按视觉顺序排列的 todo 标题数组（TodoList 列表项顺序） */
export async function getTodoTitlesInOrder(win: Page): Promise<string[]> {
  // 遍历 TodoItem 根 div（class 含 "group"），取其中的标题 div（class="text-[15px]"）
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
