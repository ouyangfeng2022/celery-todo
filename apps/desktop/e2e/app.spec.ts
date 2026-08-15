/**
 * @file 冒烟 E2E：启动 → 建项目 → 加事项 → 完成 → 搜索。
 * @description 骨架阶段只覆盖主链路；随桌面 UI 稳定逐步扩展
 * （筛选/拖拽/设置/历史等对齐 2.x e2e/ 的 spec 清单）。
 * 选择器约定与 2.x E2E 一致：语义 locator + XPath 文本包含 + 中文文案。
 */

/// <reference types='webdriverio' />
import { $, browser, expect } from '@wdio/globals';

/** 任意元素文本包含匹配（wdio 的 *= 仅匹配 <a>，文本匹配走 XPath）。 */
const containsText = (text: string) => $(`//*[contains(text(),"${text}")]`);

/** wdio 会把命名按键转换为对应的 WebDriver Unicode code point。 */
const pressEnter = () => browser.keys('Enter');

/** 排障输出：窗口/页面状态（失败时从 CI 日志直接定位隐藏/未加载/选择器错）。 */
async function dumpDiagnostics(label: string) {
  try {
    const title = await browser.getTitle();
    const size = await browser.getWindowSize();
    const source = await browser.getPageSource();
    console.log(
      `[diag:${label}] title=${JSON.stringify(title)} size=${size.width}x${size.height} ` +
        `sourceHead=${JSON.stringify(source.slice(0, 300))}`,
    );
  } catch (e) {
    console.log(`[diag:${label}] 诊断失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

describe('Celery Todo 桌面端冒烟', () => {
  it('空库首启进入「请创建项目」引导', async () => {
    await dumpDiagnostics('boot');
    // CI runner 无 2.x 数据：首启导入横幅不出现，直接进入主界面
    const createButton = await $('button=创建第一个项目');
    try {
      await createButton.waitForDisplayed({ timeout: 20000 });
    } catch (e) {
      await dumpDiagnostics('no-create-button');
      throw e;
    }
    await expect(createButton).toBeDisplayed();
  });

  it('主区引导 → 侧边栏新建项目 → 出现在项目列表', async () => {
    const createButton = await $('button=创建第一个项目');
    await createButton.click();

    // ProjectSidebar 的新建输入框（createProjectSignal 聚焦信号已触发）
    const newProjectInput = await $('input[placeholder*="项目名称"]');
    await newProjectInput.waitForDisplayed({ timeout: 5000 });
    await newProjectInput.setValue('E2E 项目');
    await pressEnter();

    const projectItem = await containsText('E2E 项目');
    await projectItem.waitForDisplayed({ timeout: 5000 });
    await expect(projectItem).toBeDisplayed();
  });

  it('添加事项 → 勾选完成 → 全部搞定卡片', async () => {
    const composer = await $('textarea[placeholder*="添加待办"]');
    await composer.waitForDisplayed({ timeout: 5000 });
    await composer.setValue('第一条 E2E 事项');
    await pressEnter();

    const todoRow = await containsText('第一条 E2E 事项');
    await todoRow.waitForDisplayed({ timeout: 5000 });

    const checkbox = await $('[aria-label="标记为已完成"]');
    await checkbox.click();

    const allDone = await containsText('全部搞定');
    await allDone.waitForDisplayed({ timeout: 5000 });
    await expect(allDone).toBeDisplayed();
  });

  it('侧边栏搜索命中标题', async () => {
    const searchButton = await $('button[aria-label="搜索所有项目中的事项"]');
    await searchButton.click();

    const searchInput = await $('input[placeholder*="搜索"]');
    await searchInput.waitForDisplayed({ timeout: 5000 });
    await searchInput.setValue('E2E');
    const hit = await containsText('第一条 E2E 事项');
    await hit.waitForDisplayed({ timeout: 5000 });
    await expect(hit).toBeDisplayed();
  });
});
