/**
 * @file install-options 单元测试
 * @description 测试 NSIS 写入的 install-options.json 的解析逻辑。
 *              normalizeInstallOptions 是纯函数，不需要 mock 任何 electron / fs。
 *              其它依赖 app.setLoginItemSettings / 文件 IO 的逻辑不做单元测试，
 *              由本地构建安装包后手动验证（参见 AGENTS.md）。
 */

import { describe, it, expect } from 'vitest';
import { normalizeInstallOptions } from '../../electron/install-options';

describe('normalizeInstallOptions', () => {
  it('合法完整对象应原样解析', () => {
    const result = normalizeInstallOptions({
      version: 1,
      autoStart: true,
      createDesktopShortcut: false,
      createStartMenuShortcut: true,
      dataDir: 'D:\\MyTodos',
    });
    expect(result).toEqual({
      version: 1,
      autoStart: true,
      createDesktopShortcut: false,
      createStartMenuShortcut: true,
      dataDir: 'D:\\MyTodos',
    });
  });

  it('NSIS 写入的字符串布尔值应正确转换', () => {
    // normalize 兼容三种形态：真 boolean、字符串 "true"/"false"、数字 1/0
    expect(normalizeInstallOptions({ autoStart: true }).autoStart).toBe(true);
    expect(normalizeInstallOptions({ autoStart: false }).autoStart).toBe(false);
    expect(normalizeInstallOptions({ autoStart: 'true' }).autoStart).toBe(true);
    expect(normalizeInstallOptions({ autoStart: 'false' }).autoStart).toBe(false);
    expect(normalizeInstallOptions({ autoStart: '1' }).autoStart).toBe(true);
    expect(normalizeInstallOptions({ autoStart: '0' }).autoStart).toBe(false);
    expect(normalizeInstallOptions({ autoStart: 1 }).autoStart).toBe(true);
    expect(normalizeInstallOptions({ autoStart: 0 }).autoStart).toBe(false);
  });

  it('NSIS 实际产物（数字而非字符串）应被正确解析', () => {
    // 对应 installer.nsh 里的产物：'{"autoStart": $OptAutoStart, ...}'
    // NSIS 变量是字符串 "1"/"0"，FileWrite 展开后写入裸 1/0，JSON.parse 解析为数字。
    // normalize 用 number !== 0 判断，所以能正确识别。
    const nsisOutput = {
      version: 1,
      autoStart: 1,
      createDesktopShortcut: 1,
      createStartMenuShortcut: 0,
      dataDir: '',
    };
    const result = normalizeInstallOptions(nsisOutput);
    expect(result.autoStart).toBe(true);
    expect(result.createDesktopShortcut).toBe(true);
    expect(result.createStartMenuShortcut).toBe(false);
  });

  it('缺字段应走默认值', () => {
    const result = normalizeInstallOptions({});
    expect(result).toEqual({
      version: 1,
      autoStart: false,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      dataDir: '',
    });
  });

  it('null/undefined 入参应返回全默认值', () => {
    const expected = {
      version: 1,
      autoStart: false,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      dataDir: '',
    };
    expect(normalizeInstallOptions(null)).toEqual(expected);
    expect(normalizeInstallOptions(undefined)).toEqual(expected);
  });

  it('类型异常的字段应被忽略并走默认值', () => {
    const result = normalizeInstallOptions({
      version: 'bad', // 不是数字
      autoStart: [], // 不是 boolean/string/number
      createDesktopShortcut: null,
      createStartMenuShortcut: undefined,
      dataDir: 42, // 不是字符串
    });
    expect(result).toEqual({
      version: 1,
      autoStart: false,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      dataDir: '',
    });
  });

  it('dataDir 应被 trim', () => {
    // 避免用户手改文件时残留的空白字符导致路径错误
    expect(normalizeInstallOptions({ dataDir: '  D:\\Todos  ' }).dataDir).toBe('D:\\Todos');
    expect(normalizeInstallOptions({ dataDir: '   ' }).dataDir).toBe('');
  });

  it('version 字段非数字时应回退到当前 schema 版本', () => {
    expect(normalizeInstallOptions({ version: 2 }).version).toBe(2);
    expect(normalizeInstallOptions({ version: 'two' }).version).toBe(1);
    expect(normalizeInstallOptions({}).version).toBe(1);
  });
});
