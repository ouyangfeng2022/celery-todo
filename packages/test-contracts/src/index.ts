/**
 * @file Repository 契约测试套件
 * @description 对任意 Repository 实现（内存 / Tauri SQLite / expo-sqlite）跑同一套
 *              行为规范，保证三端数据语义一致。套件只依赖 @celery/data 的接口
 *              与 DTO —— 不触碰 SQL、invoke 或任何平台 API。
 *
 * 用法（在具体适配器包里）：
 * ```ts
 * import { describeRepositoryContracts } from '@celery/test-contracts';
 * import { createMemoryRepositories } from '@celery/data';
 * describeRepositoryContracts('内存适配器', () => createMemoryRepositories());
 * ```
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { NewProject, NewTodo, Repositories, TodoQuery, TodoSort } from '@celery/data';
import { RepositoryError } from '@celery/data';

export function describeRepositoryContracts(
  name: string,
  createRepositories: () => Repositories | Promise<Repositories>,
): void {
  describe(`Repository 契约 —— ${name}`, () => {
    let repos: Repositories;

    beforeEach(async () => {
      repos = await createRepositories();
    });

    const makeProject = async (id: string): Promise<void> => {
      await repos.projects.create({
        id,
        name: `项目-${id}`,
        kind: 'user',
        color: '#ff8800',
      } satisfies NewProject);
    };

    const makeTodo = (id: string, projectId: string, title: string, rank: number): NewTodo => ({
      id,
      projectId,
      title,
      description: null,
      priority: 'medium',
      plannedDate: null,
      pinned: false,
      rank,
    });

    const pageQuery = (sort: TodoSort, limit: number, cursor?: string | null): TodoQuery => ({
      projectId: null,
      filter: 'all',
      priority: null,
      plannedFrom: null,
      plannedTo: null,
      sort,
      limit,
      cursor: cursor ?? null,
    });

    /** 翻完整分页，同时断言无重复无遗漏。 */
    const drain = async (sort: TodoSort, limit: number): Promise<string[]> => {
      const ids: string[] = [];
      let cursor: string | null = null;
      for (;;) {
        const page = await repos.todos.page(pageQuery(sort, limit, cursor));
        expect(page.items.length).toBeLessThanOrEqual(limit);
        ids.push(...page.items.map((t) => t.id));
        cursor = page.nextCursor;
        if (cursor === null) return ids;
      }
    };

    // ============================================
    // 项目
    // ============================================

    it('收集箱全局唯一，且不允许手动创建', async () => {
      const first = await repos.projects.ensureInbox();
      const again = await repos.projects.ensureInbox();
      expect(again.id).toBe(first.id);
      expect(again.kind).toBe('inbox');

      await expect(
        repos.projects.create({ id: 'fake-inbox', name: '假收集箱', kind: 'inbox', color: null }),
      ).rejects.toBeInstanceOf(RepositoryError);
    });

    it('项目默认 rank 追加递增，reorder 生效，归档后默认不可见', async () => {
      await makeProject('pa');
      await makeProject('pb');
      await makeProject('pc');
      const ranks = (await repos.projects.list()).map((p) => p.rank);
      expect(ranks[0]).toBeLessThan(ranks[1]);
      expect(ranks[1]).toBeLessThan(ranks[2]);

      await repos.projects.reorder({ orderedIds: ['pc', 'pa', 'pb'] });
      expect((await repos.projects.list()).map((p) => p.id)).toEqual(['pc', 'pa', 'pb']);

      await repos.projects.update('pb', { archived: true });
      expect((await repos.projects.list()).map((p) => p.id)).toEqual(['pc', 'pa']);
      const all = await repos.projects.list(true);
      expect(all.map((p) => p.id).sort()).toEqual(['pa', 'pb', 'pc']);
    });

    it('永久删除项目：活跃事项先归档并保留项目名快照', async () => {
      await makeProject('p1');
      await repos.todos.create(makeTodo('t1', 'p1', '在即将删除的项目里', 0));
      await repos.projects.deletePermanently('p1');

      expect(await repos.projects.get('p1')).toBeNull();
      const page = await repos.todos.archivedPage({
        projectId: null,
        term: null,
        limit: 10,
        cursor: null,
      });
      expect(page.items).toHaveLength(1);
      expect(page.items[0].projectName).toBe('项目-p1');
    });

    // ============================================
    // 事项：创建 / 批量事务 / 完成语义
    // ============================================

    it('空白标题与不存在项目都必须拒绝', async () => {
      await makeProject('p1');
      await expect(repos.todos.create(makeTodo('t1', 'p1', '   ', 0))).rejects.toBeInstanceOf(
        RepositoryError,
      );
      await expect(repos.todos.create(makeTodo('t2', 'ghost', '孤儿', 0))).rejects.toBeInstanceOf(
        RepositoryError,
      );
    });

    it('批量创建是全有或全无', async () => {
      await makeProject('p1');
      await repos.todos.createBulk([makeTodo('t1', 'p1', '一', 0), makeTodo('t2', 'p1', '二', 1)]);
      await expect(
        repos.todos.createBulk([
          makeTodo('t3', 'p1', '三', 2),
          makeTodo('t1', 'p1', '重复主键', 3),
        ]),
      ).rejects.toBeInstanceOf(RepositoryError);
      expect(await repos.todos.get('t3')).toBeNull();
      const counts = await repos.todos.counts('p1');
      expect(counts).toMatchObject({ total: 2, active: 2, completed: 0 });
    });

    it('完成自动盖章 completedAt，取消完成清空', async () => {
      await makeProject('p1');
      await repos.todos.create(makeTodo('t1', 'p1', '完成我', 0));

      const done = await repos.todos.update('t1', { completed: true });
      expect(done.completed).toBe(true);
      expect(done.completedAt).toBeTruthy();

      const undone = await repos.todos.update('t1', { completed: false });
      expect(undone.completed).toBe(false);
      expect(undone.completedAt).toBeNull();
    });

    // ============================================
    // 分页 / 排序 / 筛选
    // ============================================

    it('三种排序下分页稳定：不重不漏，游标随排序失效', async () => {
      await makeProject('p1');
      const items: NewTodo[] = [];
      for (let i = 0; i < 35; i++) {
        const t = makeTodo(`t${String(i).padStart(2, '0')}`, 'p1', `事项-${i}`, i * 2);
        if (i % 7 === 0) t.priority = 'high';
        items.push(t);
      }
      await repos.todos.createBulk(items);

      for (const sort of ['created-desc', 'priority', 'manual'] as const) {
        const ids = await drain(sort, 10);
        expect(ids).toHaveLength(35);
        expect(new Set(ids).size).toBe(35);
      }

      const manualSorted = await repos.todos.page(pageQuery('manual', 50));
      for (let i = 1; i < manualSorted.items.length; i++) {
        expect(manualSorted.items[i - 1].rank).toBeLessThanOrEqual(manualSorted.items[i].rank);
      }

      const page1 = await repos.todos.page(pageQuery('manual', 5));
      expect(page1.nextCursor).not.toBeNull();
      await expect(
        repos.todos.page(pageQuery('created-desc', 5, page1.nextCursor)),
      ).rejects.toBeInstanceOf(RepositoryError);
    });

    it('置顶恒居首页首行', async () => {
      await makeProject('p1');
      const items: NewTodo[] = [];
      for (let i = 0; i < 10; i++) items.push(makeTodo(`t${i}`, 'p1', `n${i}`, i));
      await repos.todos.createBulk(items);
      await repos.todos.update('t5', { pinned: true });
      const all = await drain('created-desc', 3);
      expect(all[0]).toBe('t5');
    });

    it('筛选与聚合计数', async () => {
      await makeProject('p1');
      await repos.todos.createBulk([
        { ...makeTodo('t1', 'p1', '高优', 0), priority: 'high', plannedDate: '2026-08-10' },
        { ...makeTodo('t2', 'p1', '低优', 1), priority: 'low', plannedDate: '2026-08-20' },
        makeTodo('t3', 'p1', '无计划', 2),
      ]);
      await repos.todos.update('t1', { completed: true });

      expect(
        (await repos.todos.page({ ...pageQuery('created-desc', 50), filter: 'active' })).items,
      ).toHaveLength(2);
      expect(
        (await repos.todos.page({ ...pageQuery('created-desc', 50), filter: 'completed' })).items,
      ).toHaveLength(1);

      const ranged = await repos.todos.page({
        ...pageQuery('created-desc', 50),
        plannedFrom: '2026-08-15',
        plannedTo: '2026-08-31',
      });
      expect(ranged.items.map((t) => t.id)).toEqual(['t2']);

      expect(await repos.todos.counts('p1')).toMatchObject({ total: 3, active: 2, completed: 1 });
    });

    // ============================================
    // 搜索
    // ============================================

    it('搜索命中标题与描述，翻页不丢', async () => {
      await makeProject('p1');
      await repos.todos.createBulk([
        { ...makeTodo('t1', 'p1', '写季度报告', 0), description: '包含 meeting notes 关键词' },
        { ...makeTodo('t2', 'p1', 'Weekly Meeting', 1), priority: 'high' },
        makeTodo('t3', 'p1', '无关事项', 2),
      ]);

      const search = (term: string, limit: number, cursor: string | null = null) =>
        repos.todos.search({ term, projectId: null, completed: null, limit, cursor });

      expect((await search('报告', 50)).items).toHaveLength(1);
      expect((await search('meeting', 50)).items).toHaveLength(2);
      expect((await search('Meeting', 50)).items.map((t) => t.id).sort()).toEqual(['t1', 't2']);
      expect((await search('不存在', 50)).items).toHaveLength(0);
      await expect(search('  ', 50)).rejects.toBeInstanceOf(RepositoryError);

      let cursor: string | null = null;
      const ids: string[] = [];
      for (;;) {
        const page = await search('meeting', 1, cursor);
        ids.push(...page.items.map((t) => t.id));
        cursor = page.nextCursor;
        if (cursor === null) break;
      }
      expect(ids.sort()).toEqual(['t1', 't2']);
    });

    it('搜索跟随更新与归档（不返回已归档事项）', async () => {
      await makeProject('p1');
      await repos.todos.create({ ...makeTodo('t1', 'p1', '改名前', 0), description: 'old text' });
      await repos.todos.update('t1', { title: '改名后目标词' });
      expect(
        (
          await repos.todos.search({
            term: '目标词',
            projectId: null,
            completed: null,
            limit: 10,
            cursor: null,
          })
        ).items,
      ).toHaveLength(1);

      await repos.todos.archive(['t1']);
      expect(
        (
          await repos.todos.search({
            term: '目标词',
            projectId: null,
            completed: null,
            limit: 10,
            cursor: null,
          })
        ).items,
      ).toHaveLength(0);
    });

    // ============================================
    // 归档 / 恢复 / 永久删除
    // ============================================

    it('归档 → 恢复 → 永久删除全流程', async () => {
      await makeProject('p1');
      await repos.todos.create(makeTodo('t1', 'p1', '将被归档', 0));

      await repos.todos.archive(['t1']);
      expect(await repos.todos.get('t1')).toBeNull();
      const page = await repos.todos.archivedPage({
        projectId: null,
        term: null,
        limit: 10,
        cursor: null,
      });
      expect(page.items).toHaveLength(1);
      expect(page.items[0].archivedAt).toBeTruthy();

      expect(await repos.todos.restoreArchived(['t1'])).toBe(1);
      expect((await repos.todos.get('t1'))?.title).toBe('将被归档');

      await repos.todos.archive(['t1']);
      expect(await repos.todos.purgeArchived(['t1'])).toBe(1);
      expect(
        (await repos.todos.archivedPage({ projectId: null, term: null, limit: 10, cursor: null }))
          .items,
      ).toHaveLength(0);
    });

    it('原项目已删除时恢复需要 fallback 项目', async () => {
      await makeProject('p1');
      await repos.todos.create(makeTodo('t1', 'p1', '孤儿预备', 0));
      await repos.todos.archive(['t1']);
      await repos.projects.deletePermanently('p1');

      await expect(repos.todos.restoreArchived(['t1'])).rejects.toBeInstanceOf(RepositoryError);

      const inbox = await repos.projects.ensureInbox();
      expect(await repos.todos.restoreArchived(['t1'], inbox.id)).toBe(1);
      expect((await repos.todos.get('t1'))?.projectId).toBe(inbox.id);
    });

    it('归档分页支持子串过滤且不丢数据', async () => {
      await makeProject('p1');
      const items: NewTodo[] = [];
      for (let i = 0; i < 12; i++) {
        const title = i % 2 === 0 ? `周报-${i}` : `杂项-${i}`;
        items.push(makeTodo(`t${i}`, 'p1', title, i));
      }
      await repos.todos.createBulk(items);
      await repos.todos.archive(items.map((t) => t.id));

      let cursor: string | null = null;
      let total = 0;
      for (;;) {
        const page = await repos.todos.archivedPage({
          projectId: null,
          term: '周报',
          limit: 3,
          cursor,
        });
        total += page.items.length;
        cursor = page.nextCursor;
        if (cursor === null) break;
      }
      expect(total).toBe(6);
    });

    // ============================================
    // 移动 / 手动排序
    // ============================================

    it('跨项目移动与项目内手动排序', async () => {
      await makeProject('p1');
      await makeProject('p2');
      await repos.todos.createBulk([
        makeTodo('t1', 'p1', '一', 0),
        makeTodo('t2', 'p1', '二', 1),
        makeTodo('t3', 'p1', '三', 2),
      ]);

      expect(await repos.todos.move({ ids: ['t1', 't3'], targetProjectId: 'p2' })).toBe(2);
      expect((await repos.todos.get('t1'))?.projectId).toBe('p2');

      await repos.todos.reorder({ projectId: 'p2', orderedIds: ['t3', 't1'] });
      const page = await repos.todos.page({ ...pageQuery('manual', 10), projectId: 'p2' });
      expect(page.items.map((t) => t.id)).toEqual(['t3', 't1']);
    });

    // ============================================
    // 设置
    // ============================================

    it('设置 K/V 读写、覆盖、前缀查询与删除', async () => {
      expect(await repos.settings.get('theme')).toBeNull();
      await repos.settings.set('theme', 'celery');
      await repos.settings.set('theme', 'default');
      expect(await repos.settings.get('theme')).toBe('default');

      await repos.settings.setBulk([
        { key: 'sort.p1', value: 'manual' },
        { key: 'sort.p2', value: 'priority' },
      ]);
      expect(await repos.settings.byPrefix('sort.')).toHaveLength(2);

      await repos.settings.delete('sort.p1');
      expect(await repos.settings.get('sort.p1')).toBeNull();
      expect(await repos.settings.all()).toHaveLength(2);
    });
  });
}
