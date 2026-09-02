import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { bindExternalLinks, openExternal } from '../platform';

// bindExternalLinks 用模块级 flag 保证只绑一次；jsdom 下 isTauri === false，
// openExternal 走 window.open 新标签页回退。beforeAll 绑定后本文件共用监听器。
beforeAll(() => {
  bindExternalLinks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('openExternal / bindExternalLinks（非 Tauri 环境）', () => {
  it('openExternal 回退为新标签页打开', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    openExternal('https://example.com');
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', expect.any(String));
  });

  it('点击外部 http 链接：阻止当前窗口导航并转默认浏览器', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const link = document.createElement('a');
    link.href = 'https://example.com/page';
    link.textContent = '外部链接';
    document.body.appendChild(link);

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    const handled = link.dispatchEvent(event);

    // dispatchEvent 返回 false 表示 preventDefault 已被调用（当前窗口不导航）
    expect(handled).toBe(false);
    expect(open).toHaveBeenCalledWith('https://example.com/page', '_blank', expect.any(String));
    document.body.removeChild(link);
  });

  it('点击同源链接保留默认导航', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const link = document.createElement('a');
    link.href = '#anchor';
    link.textContent = '应用内链接';
    document.body.appendChild(link);

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    const handled = link.dispatchEvent(event);

    expect(handled).toBe(true);
    expect(open).not.toHaveBeenCalled();
    document.body.removeChild(link);
  });

  it('点击 mailto 链接转默认程序', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const link = document.createElement('a');
    link.href = 'mailto:test@example.com';
    link.textContent = '写信';
    document.body.appendChild(link);

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(event);

    expect(open).toHaveBeenCalled();
    document.body.removeChild(link);
  });
});
