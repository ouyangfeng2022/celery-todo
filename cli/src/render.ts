/**
 * @file 终端渲染：ANSI 颜色 + 表格 + 交互确认
 * @description 零依赖实现。非 TTY 环境自动关闭颜色，便于管道/脚本消费。
 *              颜色码使用最通用的 8 色 ANSI，兼容 Windows 10+ 与常见终端。
 */

import * as readline from 'node:readline';
import { isatty } from 'node:tty';

// ============================================
// 颜色开关
// ============================================

/** 是否启用颜色输出：TTY 且未显式禁用时为 true */
const colorEnabled = (() => {
  if (process.env.NO_COLOR !== undefined) return false; // 遵循 https://no-color.org
  if (process.env.FORCE_COLOR === '0') return false;
  return isatty(process.stdout.fd);
})();

function wrap(open: string, close: string, text: string): string {
  return colorEnabled ? `${open}${text}${close}` : text;
}

const c = {
  red: (s: string) => wrap('\x1b[31m', '\x1b[39m', s),
  green: (s: string) => wrap('\x1b[32m', '\x1b[39m', s),
  yellow: (s: string) => wrap('\x1b[33m', '\x1b[39m', s),
  blue: (s: string) => wrap('\x1b[34m', '\x1b[39m', s),
  magenta: (s: string) => wrap('\x1b[35m', '\x1b[39m', s),
  cyan: (s: string) => wrap('\x1b[36m', '\x1b[39m', s),
  gray: (s: string) => wrap('\x1b[90m', '\x1b[39m', s),
  bold: (s: string) => wrap('\x1b[1m', '\x1b[22m', s),
  dim: (s: string) => wrap('\x1b[2m', '\x1b[22m', s),
  strike: (s: string) => wrap('\x1b[9m', '\x1b[29m', s),
};

export { c as color };

// ============================================
// 工具：展示宽度（CJK 全角算 2 列）
// ============================================

/** 计算字符串在等宽终端的显示宽度（全角/CJK 占 2） */
function displayWidth(str: string): number {
  let w = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0) ?? 0;
    // 简化判定：CJK 统一汉字、全角标点、假名、谚文等常见区间视作 2 宽。
    if (
      (code >= 0x1100 && code <= 0x115f) || // 谚文
      (code >= 0x2e80 && code <= 0x303e) || // CJK 部首/标点
      (code >= 0x3040 && code <= 0x33bf) || // 假名/注音/全角符号
      (code >= 0x3400 && code <= 0x4dbf) || // CJK 扩展 A
      (code >= 0x4e00 && code <= 0xa4cf) || // CJK 统一汉字 + 兼容
      (code >= 0xac00 && code <= 0xd7af) || // 谚文音节
      (code >= 0xf900 && code <= 0xfaff) || // CJK 兼容表意
      (code >= 0xfe30 && code <= 0xfe6f) || // CJK 兼容形式
      (code >= 0xff01 && code <= 0xff60) || // 全角 ASCII/标点
      (code >= 0xffe0 && code <= 0xffe6) // 全角货币
    ) {
      w += 2;
    } else if (code >= 0x20) {
      w += 1;
    }
    // 控制字符不计宽
  }
  return w;
}

/** 右侧补空格到目标显示宽度（按显示宽截断/补齐） */
function padEnd(str: string, width: number): string {
  const dw = displayWidth(str);
  if (dw >= width) return str;
  return str + ' '.repeat(width - dw);
}

// ============================================
// 待办渲染
// ============================================

import type { DeletedTodo, Priority, Project, Todo } from './types';

/** 优先级短标记（带颜色） */
export function priorityLabel(p: Priority): string {
  switch (p) {
    case 'high':
      return c.red('高');
    case 'medium':
      return c.yellow('中');
    case 'low':
      return c.gray('低');
  }
}

/** 优先级单字符图标 */
function priorityIcon(p: Priority): string {
  switch (p) {
    case 'high':
      return c.red('!');
    case 'medium':
      return c.yellow('·');
    case 'low':
      return c.gray(' ');
  }
}

/** 状态勾选框 */
function statusMark(todo: Todo): string {
  return todo.completed ? c.green('✔') : c.gray('○');
}

/** 截止日期相对标签：逾期红、临近黄、未来灰、无空 */
export function dueLabel(dueDate?: string): string {
  if (!dueDate) return '';
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return '';
  const now = new Date();
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const diff = Math.round((startOfDay(due) - startOfDay(now)) / 86400000);
  let label: string;
  if (diff === 0) label = '今天';
  else if (diff === 1) label = '明天';
  else if (diff === -1) label = '昨天';
  else if (diff > 0 && diff < 7) label = `${diff}天后`;
  else if (diff < 0 && diff > -7) label = `${Math.abs(diff)}天前`;
  else {
    label = due.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  }
  // 逾期染色（今天截止但未完成不算逾期）
  return diff < 0 ? c.red(label) : diff <= 1 ? c.yellow(label) : c.gray(label);
}

/** 项目名查找辅助 */
function buildProjectMap(projects: Project[]): Map<string, Project> {
  return new Map(projects.map((p) => [p.id, p]));
}

interface TodoRowView {
  todo: Todo;
  project?: Project;
}

/**
 * 渲染 todo 列表为对齐表格。
 * 列：状态 | 优先级 | 标题 | 项目 | 截止 | ID(短)
 * 已完成行标题加灰色 + 删除线；非 TTY 关闭颜色后仍可读。
 */
export function renderTodoTable(todos: Todo[], projects: Project[]): string {
  if (todos.length === 0) return c.gray('（无待办）');

  const pmap = buildProjectMap(projects);
  const views: TodoRowView[] = todos.map((todo) => ({
    todo,
    project: pmap.get(todo.projectId),
  }));

  const lines: string[] = [];
  for (const { todo, project } of views) {
    const status = statusMark(todo);
    const icon = priorityIcon(todo.priority);
    let title = todo.title;
    if (todo.completed) title = c.strike(c.gray(title));
    const proj = project ? c.cyan(project.name) : c.gray('?');
    const due = dueLabel(todo.dueDate);
    const id = c.gray(todo.id.slice(0, 8));
    // 使用固定列宽 + 标题占位补齐，保证多行视觉对齐
    const titleCol = padEnd(title, Math.max(displayWidth(todo.title), 1));
    lines.push(
      [status, ` ${icon}`, ' ', titleCol, '  ', proj, due ? '  ' + due : '', '  ' + id].join(''),
    );
  }
  return lines.join('\n');
}

/**
 * 渲染归档（历史记录）列表。比 todo 表多一列「删除时间」。
 */
export function renderArchiveTable(items: DeletedTodo[]): string {
  if (items.length === 0) return c.gray('（回收站为空）');
  const lines: string[] = [];
  for (const it of items) {
    const status = it.completed ? c.green('✔') : c.gray('○');
    let title = it.title;
    if (it.completed) title = c.strike(c.gray(title));
    const due = dueLabel(it.dueDate);
    const id = c.gray(it.id.slice(0, 8));
    const deletedAt = c.gray(formatRelative(it.deletedAt));
    lines.push(
      [
        status,
        ' ',
        padEnd(title, Math.max(displayWidth(it.title), 1)),
        '  ',
        due,
        '  ',
        deletedAt,
        '  ' + id,
      ].join(''),
    );
  }
  return lines.join('\n');
}

/**
 * 渲染单条 todo 详情（多行展开）。
 */
export function renderTodoDetail(todo: Todo, project?: Project): string {
  const lines: string[] = [];
  lines.push(c.bold(todo.title));
  lines.push(`${c.gray('ID:')}        ${todo.id}`);
  lines.push(`${c.gray('状态:')}      ${todo.completed ? c.green('已完成') : '未完成'}`);
  lines.push(`${c.gray('优先级:')}    ${priorityLabel(todo.priority)}`);
  if (project) lines.push(`${c.gray('项目:')}      ${project.name}`);
  if (todo.dueDate)
    lines.push(`${c.gray('截止:')}      ${todo.dueDate.slice(0, 10)} (${dueLabel(todo.dueDate)})`);
  if (todo.description) lines.push(`${c.gray('描述:')}      ${todo.description}`);
  lines.push(`${c.gray('创建于:')}    ${formatAbsolute(todo.createdAt)}`);
  lines.push(`${c.gray('更新于:')}    ${formatAbsolute(todo.updatedAt)}`);
  if (todo.completedAt) lines.push(`${c.gray('完成于:')}    ${formatAbsolute(todo.completedAt)}`);
  return lines.join('\n');
}

/**
 * 渲染项目列表（含每个项目的待办统计）。
 */
export function renderProjectList(
  projects: Project[],
  counts: Map<string, { total: number; active: number; completed: number }>,
): string {
  if (projects.length === 0) return c.gray('（无项目）');
  const lines: string[] = [];
  for (const p of projects) {
    const stat = counts.get(p.id) ?? { total: 0, active: 0, completed: 0 };
    const dot = p.color ? colorDot(p.color) : c.gray('○');
    lines.push(
      [
        dot,
        c.bold(p.name),
        c.gray(` (${stat.active} 进行 / ${stat.completed} 完成 / ${stat.total} 共)`),
        '  ' + c.gray(p.id.slice(0, 8)),
      ].join('  '),
    );
  }
  return lines.join('\n');
}

/** 用项目颜色渲染一个圆点（仅支持常见命名色，未知色降级为灰） */
function colorDot(color: string): string {
  const map: Record<string, (s: string) => string> = {
    red: c.red,
    green: c.green,
    yellow: c.yellow,
    blue: c.blue,
    purple: c.magenta,
    magenta: c.magenta,
    cyan: c.cyan,
    gray: c.gray,
    orange: c.yellow,
  };
  const fn = map[color.toLowerCase()] ?? c.gray;
  return fn('●');
}

// ============================================
// 日期格式化
// ============================================

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  return d.toLocaleDateString('zh-CN');
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================
// 交互确认
// ============================================

/**
 * 在 TTY 环境下询问 y/n；非 TTY 默认返回 yes（脚本友好）。
 * @returns 用户确认（true=yes）
 */
export async function confirm(message: string, defaultValue = false): Promise<boolean> {
  if (!isatty(process.stdin.fd)) return true;
  const hint = defaultValue ? '[Y/n]' : '[y/N]';
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${message} ${hint} `, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === '') return resolve(defaultValue);
      resolve(a === 'y' || a === 'yes');
    });
  });
}

// ============================================
// 杂项输出
// ============================================

export function println(text = ''): void {
  process.stdout.write(text + '\n');
}

export function eprintln(text = ''): void {
  process.stderr.write(text + '\n');
}

/** 输出 JSON（--json 模式） */
export function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

/** 统一的错误打印（红色 + 退出码） */
export function printError(message: string): void {
  eprintln(c.red('错误: ') + message);
}
