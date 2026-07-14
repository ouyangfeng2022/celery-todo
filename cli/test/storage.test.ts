/**
 * @file storage.ts 单元测试
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  APP_PACKAGE_NAME,
  APP_PRODUCT_NAME,
  DB_FILENAME,
  dbFileExists,
  getCandidateUserDataDirs,
  getDefaultDataDir,
  getStorageInfo,
  getUserDataDir,
  readStorageConfig,
  resolveDbPath,
} from '../src/storage';

describe('storage path resolution', () => {
  const savedAppdata = process.env.APPDATA;
  const savedCeleryDb = process.env.CELERY_TODO_DB;
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'celery-storage-test-'));
    // 把 APPDATA 指向临时目录，使所有路径解析落在测试沙箱内
    process.env.APPDATA = tmpRoot;
    delete process.env.CELERY_TODO_DB;
  });

  afterEach(() => {
    process.env.APPDATA = savedAppdata;
    if (savedCeleryDb === undefined) delete process.env.CELERY_TODO_DB;
    else process.env.CELERY_TODO_DB = savedCeleryDb;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('候选目录包含 productName（打包版）与 packageName（开发版）', () => {
    const dirs = getCandidateUserDataDirs();
    expect(dirs).toHaveLength(2);
    expect(dirs[0]).toBe(path.join(tmpRoot, APP_PRODUCT_NAME));
    expect(dirs[1]).toBe(path.join(tmpRoot, APP_PACKAGE_NAME));
  });

  it('无任何数据时，getUserDataDir 回退到 productName（与打包版默认一致）', () => {
    expect(getUserDataDir()).toBe(path.join(tmpRoot, APP_PRODUCT_NAME));
  });

  it('默认数据目录为 userData/data', () => {
    expect(getDefaultDataDir()).toBe(path.join(tmpRoot, APP_PRODUCT_NAME, 'data'));
  });

  it('存在 storage-config.json 时优先命中该 userData 目录', () => {
    // 仅创建开发版目录 + 配置，应被选中而非 productName
    const devDir = path.join(tmpRoot, APP_PACKAGE_NAME);
    fs.mkdirSync(devDir, { recursive: true });
    fs.writeFileSync(
      path.join(devDir, 'storage-config.json'),
      JSON.stringify({ dataDir: path.join(devDir, 'data') }),
    );
    expect(getUserDataDir()).toBe(devDir);
  });

  it('resolveDbPath：--db 覆盖一切', () => {
    const override = path.join(tmpRoot, 'custom.db');
    expect(resolveDbPath(override)).toBe(override);
  });

  it('resolveDbPath：CELERY_TODO_DB 次优先', () => {
    const envPath = path.join(tmpRoot, 'env.db');
    process.env.CELERY_TODO_DB = envPath;
    expect(resolveDbPath()).toBe(envPath);
  });

  it('resolveDbPath：默认走 config.dataDir + DB_FILENAME', () => {
    const prodDir = path.join(tmpRoot, APP_PRODUCT_NAME);
    fs.mkdirSync(prodDir, { recursive: true });
    fs.writeFileSync(
      path.join(prodDir, 'storage-config.json'),
      JSON.stringify({ dataDir: path.join(prodDir, 'mydata') }),
    );
    expect(resolveDbPath()).toBe(path.join(prodDir, 'mydata', DB_FILENAME));
  });

  it('readStorageConfig：文件缺失时回退默认目录且 customized=false', () => {
    const cfg = readStorageConfig();
    expect(cfg.customized).toBe(false);
    expect(cfg.dataDir).toBe(path.join(tmpRoot, APP_PRODUCT_NAME, 'data'));
  });

  it('readStorageConfig：损坏 JSON 静默回退默认', () => {
    const prodDir = path.join(tmpRoot, APP_PRODUCT_NAME);
    fs.mkdirSync(prodDir, { recursive: true });
    fs.writeFileSync(path.join(prodDir, 'storage-config.json'), '{ not valid json');
    const cfg = readStorageConfig();
    expect(cfg.customized).toBe(false);
  });

  it('getStorageInfo：--db 时 customized=true', () => {
    const info = getStorageInfo('/tmp/x.db');
    expect(info.customized).toBe(true);
    expect(info.filePath).toBe(path.resolve('/tmp/x.db'));
  });

  it('dbFileExists：不存在返回 false', () => {
    expect(dbFileExists(path.join(tmpRoot, 'nope.db'))).toBe(false);
  });

  it('dbFileExists：存在文件返回 true', () => {
    const f = path.join(tmpRoot, 'exists.db');
    fs.writeFileSync(f, '');
    expect(dbFileExists(f)).toBe(true);
  });
});
