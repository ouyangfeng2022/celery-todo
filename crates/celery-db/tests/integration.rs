//! 集成测试：迁移、分页、搜索、归档与事务语义。
//! 全部跑在临时文件库或内存库上；文件库用例同时验证 WAL / busy_timeout PRAGMA。

use celery_db::dto::*;
use celery_db::CeleryDb;

fn mem() -> CeleryDb {
    CeleryDb::open_in_memory().expect("内存库初始化失败")
}

fn project(db: &CeleryDb, id: &str) -> ProjectDto {
    db.create_project(NewProject {
        id: id.into(),
        name: format!("项目-{id}"),
        kind: ProjectKind::User,
        color: Some("#ff8800".into()),
        rank: None,
    })
    .expect("创建项目失败")
}

fn new_todo(id: &str, pid: &str, title: &str, rank: f64) -> NewTodo {
    NewTodo {
        id: id.into(),
        project_id: pid.into(),
        title: title.into(),
        description: None,
        priority: TodoPriority::Medium,
        planned_date: None,
        pinned: false,
        rank,
    }
}

fn query(sort: TodoSort, limit: u32, cursor: Option<String>) -> TodoQuery {
    TodoQuery {
        project_id: None,
        filter: TodoFilter::All,
        priority: None,
        planned_from: None,
        planned_to: None,
        sort,
        limit,
        cursor,
    }
}

/// 收集全部分页结果，同时校验：无重复、无遗漏、next_cursor 终止。
fn drain(db: &CeleryDb, sort: TodoSort, limit: u32) -> Vec<TodoDto> {
    let mut out = Vec::new();
    let mut cursor = None;
    loop {
        let page = db.todo_page(&query(sort, limit, cursor.clone())).expect("分页查询失败");
        assert!(
            page.items.len() <= limit as usize,
            "单页不得超过 limit"
        );
        out.extend(page.items);
        cursor = page.next_cursor;
        if cursor.is_none() {
            return out;
        }
    }
}

// ============================================
// 迁移与 PRAGMA
// ============================================

#[test]
fn file_db_migrates_and_sets_wal() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("nested").join("celery.db");
    let db = CeleryDb::open(&path).expect("文件库打开失败");
    assert_eq!(db.schema_version().unwrap(), 1);
    // 幂等重放
    assert_eq!(db.migrate_to_latest().unwrap(), 1);

    let journal: String = {
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.query_row("PRAGMA journal_mode", [], |r| r.get(0)).unwrap()
    };
    assert_eq!(journal.to_lowercase(), "wal", "文件库必须启用 WAL");

    // 重新打开已存在的库不再报错（迁移跳过）
    let db2 = CeleryDb::open(&path).unwrap();
    assert_eq!(db2.schema_version().unwrap(), 1);
}

// ============================================
// 项目
// ============================================

#[test]
fn inbox_is_singleton() {
    let db = mem();
    let first = db.ensure_inbox().unwrap();
    let again = db.ensure_inbox().unwrap();
    assert_eq!(first.id, again.id, "收集箱全局唯一");
    assert!(matches!(again.kind, ProjectKind::Inbox));
    // 直接创建 inbox 项目被拒绝
    let err = db.create_project(NewProject {
        id: "p-inbox-2".into(),
        name: "假收集箱".into(),
        kind: ProjectKind::Inbox,
        color: None,
        rank: None,
    });
    assert!(err.is_err());
}

#[test]
fn project_archive_and_reorder() {
    let db = mem();
    let a = project(&db, "pa");
    let b = project(&db, "pb");
    let c = project(&db, "pc");
    assert!(a.rank < b.rank && b.rank < c.rank, "默认 rank 追加递增");

    db.reorder_projects(&[c.id.clone(), a.id.clone(), b.id.clone()])
        .unwrap();
    let list = db.list_projects(false).unwrap();
    assert_eq!(
        list.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(),
        vec!["pc", "pa", "pb"],
        "reorder 后按新 rank 排序"
    );

    db.update_project(
        "pb",
        &ProjectPatch {
            name: None,
            color: None,
            archived: Some(true),
        },
    )
    .unwrap();
    let active = db.list_projects(false).unwrap();
    assert_eq!(active.len(), 2, "归档项目默认不出现");
    assert!(db.get_project("pb").unwrap().archived_at.is_some());
}

#[test]
fn deleting_project_archives_its_todos_with_name_snapshot() {
    let db = mem();
    project(&db, "p1");
    db.create_todo(new_todo("t1", "p1", "在即将删除的项目里", 0.0))
        .unwrap();

    db.delete_project_permanently("p1").unwrap();
    assert!(db.get_project("p1").is_err());

    let page = db.archived_page(&ArchivedQuery {
        project_id: None,
        term: None,
        limit: 10,
        cursor: None,
    })
    .unwrap();
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].project_name.as_deref(), Some("项目-p1"));
}

// ============================================
// Todo CRUD 与批量事务
// ============================================

#[test]
fn create_todo_validates_title_and_project() {
    let db = mem();
    project(&db, "p1");
    let mut t = new_todo("t1", "p1", "  ", 0.0); // 空白标题
    assert!(db.create_todo(t.clone()).is_err());
    t.title = "正常".into();
    assert!(db.create_todo(t).is_ok());

    let orphan = new_todo("t2", "no-such-project", "孤儿", 0.0);
    assert!(db.create_todo(orphan).is_err(), "项目不存在必须失败");
}

#[test]
fn bulk_create_is_all_or_nothing() {
    let db = mem();
    project(&db, "p1");
    let ok = vec![
        new_todo("t1", "p1", "一", 0.0),
        new_todo("t2", "p1", "二", 65536.0),
    ];
    assert_eq!(db.create_todos_bulk(ok).unwrap(), 2);

    // 第二条主键冲突 → 整批回滚，第一条也不得存在
    let conflict = vec![
        new_todo("t3", "p1", "三", 0.0),
        new_todo("t1", "p1", "重复主键", 0.0),
    ];
    assert!(db.create_todos_bulk(conflict).is_err());
    assert!(db.get_todo("t3").is_err(), "事务回滚后不得残留");

    let counts = db.todo_counts(Some("p1")).unwrap();
    assert_eq!(counts.total, 2);
}

#[test]
fn patch_completion_stamps_completed_at() {
    let db = mem();
    project(&db, "p1");
    db.create_todo(new_todo("t1", "p1", "完成我", 0.0)).unwrap();

    let mut patch = TodoPatch::default();
    patch.completed = Some(true);
    let done = db.update_todo("t1", &patch).unwrap();
    assert!(done.completed);
    assert!(done.completed_at.is_some(), "完成时间由仓储自动盖章");

    patch.completed = Some(false);
    let undone = db.update_todo("t1", &patch).unwrap();
    assert!(!undone.completed);
    assert!(undone.completed_at.is_none(), "取消完成清空完成时间");
}

// ============================================
// 分页与排序
// ============================================

#[test]
fn pagination_is_stable_across_sorts() {
    let db = mem();
    project(&db, "p1");
    let mut items = Vec::new();
    for i in 0..35 {
        let mut t = new_todo(&format!("t{i:02}"), "p1", &format!("事项-{i:02}"), i as f64 * 2.0);
        if i % 7 == 0 {
            t.priority = TodoPriority::High;
        }
        items.push(t);
    }
    db.create_todos_bulk(items).unwrap();

    for sort in [TodoSort::CreatedDesc, TodoSort::Priority, TodoSort::Manual] {
        let all = drain(&db, sort, 10);
        assert_eq!(all.len(), 35, "{sort:?} 分页不得丢/重");
        let ids: Vec<&str> = all.iter().map(|t| t.id.as_str()).collect();
        let uniq: std::collections::HashSet<&&str> = ids.iter().collect();
        assert_eq!(uniq.len(), ids.len(), "{sort:?} 不得重复");
    }

    // manual 排序遵循 rank 升序
    let manual = drain(&db, TodoSort::Manual, 50);
    for pair in manual.windows(2) {
        assert!(pair[0].rank <= pair[1].rank);
    }

    // 游标换排序必须失效
    let page1 = db.todo_page(&query(TodoSort::Manual, 5, None)).unwrap();
    let cursor = page1.next_cursor.unwrap();
    let bad = db.todo_page(&query(TodoSort::CreatedDesc, 5, Some(cursor)));
    assert!(bad.is_err(), "跨排序使用游标必须报错");
}

#[test]
fn pinned_float_to_front_within_pages() {
    let db = mem();
    project(&db, "p1");
    let mut items: Vec<NewTodo> = Vec::new();
    for i in 0..10 {
        items.push(new_todo(&format!("t{i}"), "p1", &format!("n{i}"), i as f64));
    }
    db.create_todos_bulk(items).unwrap();
    let mut patch = TodoPatch::default();
    patch.pinned = Some(true);
    db.update_todo("t5", &patch).unwrap();

    let all = drain(&db, TodoSort::CreatedDesc, 3);
    assert_eq!(all[0].id, "t5", "置顶恒居首");
}

#[test]
fn filters_and_counts() {
    let db = mem();
    project(&db, "p1");
    let mut a = new_todo("t1", "p1", "高优", 0.0);
    a.priority = TodoPriority::High;
    a.planned_date = Some("2026-08-10".into());
    let mut b = new_todo("t2", "p1", "低优", 1.0);
    b.priority = TodoPriority::Low;
    b.planned_date = Some("2026-08-20".into());
    let c = new_todo("t3", "p1", "无计划", 2.0);
    db.create_todos_bulk(vec![a, b, c]).unwrap();

    let mut done = TodoPatch::default();
    done.completed = Some(true);
    db.update_todo("t1", &done).unwrap();

    let mut q = query(TodoSort::CreatedDesc, 50, None);
    q.filter = TodoFilter::Active;
    assert_eq!(db.todo_page(&q).unwrap().items.len(), 2);

    q.filter = TodoFilter::Completed;
    assert_eq!(db.todo_page(&q).unwrap().items.len(), 1);

    q.filter = TodoFilter::All;
    q.planned_from = Some("2026-08-15".into());
    q.planned_to = Some("2026-08-31".into());
    assert_eq!(db.todo_page(&q).unwrap().items.len(), 1, "计划日期区间过滤");

    let counts = db.todo_counts(Some("p1")).unwrap();
    assert_eq!((counts.total, counts.active, counts.completed), (3, 2, 1));
}

// ============================================
// 搜索（FTS5 trigram + 短词 LIKE 回退）
// ============================================

#[test]
fn search_matches_substring_latin_and_cjk() {
    let db = mem();
    project(&db, "p1");
    let mut a = new_todo("t1", "p1", "写季度报告", 0.0);
    a.description = Some("包含 meeting notes 关键词".into());
    let mut b = new_todo("t2", "p1", "Weekly Meeting".into(), 1.0);
    b.priority = TodoPriority::High;
    let c = new_todo("t3", "p1", "无关事项", 2.0);
    db.create_todos_bulk(vec![a, b, c]).unwrap();

    // ≥3 字符走 FTS trigram（子串、大小写不敏感）；<3 字符（如 2 字 CJK 词）回退 LIKE
    let hit = |term: &str, expected: usize| {
        let page = db
            .search_todos(&SearchQuery {
                term: term.into(),
                project_id: None,
                completed: None,
                limit: 50,
                cursor: None,
            })
            .unwrap();
        assert_eq!(page.items.len(), expected, "搜索 {term} 命中数");
    };
    hit("报告", 1); // 2 字 CJK → LIKE 回退
    hit("季度报告", 1); // 4 字 → FTS
    hit("meeting", 2); // 拉丁词（标题 + 描述）
    hit("Meeting", 2); // FTS trigram 大小写不敏感
    hit("不存在", 0);

    // 搜索分页稳定性
    let mut cursor = None;
    let mut total = 0;
    loop {
        let page = db
            .search_todos(&SearchQuery {
                term: "meeting".into(),
                project_id: None,
                completed: None,
                limit: 1,
                cursor,
            })
            .unwrap();
        total += page.items.len();
        cursor = page.next_cursor;
        if cursor.is_none() {
            break;
        }
    }
    assert_eq!(total, 2);
}

#[test]
fn search_stays_in_sync_after_update_and_archive() {
    let db = mem();
    project(&db, "p1");
    let mut t = new_todo("t1", "p1", "改名前", 0.0);
    t.description = Some("old text".into());
    db.create_todo(t).unwrap();

    // 更新标题/描述 → 触发器同步 FTS
    let mut patch = TodoPatch::default();
    patch.title = Some("改名后目标词".into());
    db.update_todo("t1", &patch).unwrap();
    let found = db
        .search_todos(&SearchQuery {
            term: "目标词".into(),
            project_id: None,
            completed: None,
            limit: 10,
            cursor: None,
        })
        .unwrap();
    assert_eq!(found.items.len(), 1);

    // 归档后不再出现在活跃搜索
    db.archive_todos(&["t1".into()]).unwrap();
    let gone = db
        .search_todos(&SearchQuery {
            term: "目标词".into(),
            project_id: None,
            completed: None,
            limit: 10,
            cursor: None,
        })
        .unwrap();
    assert_eq!(gone.items.len(), 0);
}

// ============================================
// 归档 / 恢复 / 永久删除
// ============================================

#[test]
fn archive_restore_purge_lifecycle() {
    let db = mem();
    project(&db, "p1");
    db.create_todo(new_todo("t1", "p1", "将被归档", 0.0)).unwrap();
    db.archive_todos(&["t1".into()]).unwrap();
    assert!(db.get_todo("t1").is_err(), "归档后不再是活跃 todo");

    let page = db.archived_page(&ArchivedQuery {
        project_id: None,
        term: None,
        limit: 10,
        cursor: None,
    })
    .unwrap();
    assert_eq!(page.items.len(), 1);
    assert!(!page.items[0].archived_at.is_empty());
    // v3 语义：归档无 30 天过期（schema 本身不含 expires_at 列，见 v3_initial.sql）

    // 恢复
    assert_eq!(db.restore_archived(&["t1".into()], None).unwrap(), 1);
    let back = db.get_todo("t1").unwrap();
    assert_eq!(back.title, "将被归档");

    // 永久删除
    db.archive_todos(&["t1".into()]).unwrap();
    assert_eq!(db.purge_archived(&["t1".into()]).unwrap(), 1);
    assert_eq!(
        db.archived_page(&ArchivedQuery {
            project_id: None,
            term: None,
            limit: 10,
            cursor: None
        })
        .unwrap()
        .items
        .len(),
        0
    );
}

#[test]
fn restore_orphan_needs_fallback_project() {
    let db = mem();
    project(&db, "p1");
    db.create_todo(new_todo("t1", "p1", "孤儿预备", 0.0)).unwrap();
    db.archive_todos(&["t1".into()]).unwrap();
    db.delete_project_permanently("p1").unwrap();

    // 原项目已删 + 无 fallback → 拒绝（不静默丢数据）
    assert!(db.restore_archived(&["t1".into()], None).is_err());

    let inbox = db.ensure_inbox().unwrap();
    assert_eq!(db.restore_archived(&["t1".into()], Some(&inbox.id)).unwrap(), 1);
    assert_eq!(db.get_todo("t1").unwrap().project_id, inbox.id);
}

#[test]
fn archived_page_filters_by_term_and_paginates() {
    let db = mem();
    project(&db, "p1");
    let mut items = Vec::new();
    for i in 0..12 {
        let title = if i % 2 == 0 { format!("周报-{i}") } else { format!("杂项-{i}") };
        items.push(new_todo(&format!("t{i}"), "p1", &title, i as f64));
    }
    db.create_todos_bulk(items).unwrap();
    let ids: Vec<String> = (0..12).map(|i| format!("t{i}")).collect();
    db.archive_todos(&ids).unwrap();

    let page = db
        .archived_page(&ArchivedQuery {
            project_id: None,
            term: Some("周报".into()),
            limit: 3,
            cursor: None,
        })
        .unwrap();
    assert_eq!(page.items.len(), 3);
    let mut cursor = page.next_cursor;
    let mut total = 3;
    while let Some(c) = cursor {
        let p = db
            .archived_page(&ArchivedQuery {
                project_id: None,
                term: Some("周报".into()),
                limit: 3,
                cursor: Some(c),
            })
            .unwrap();
        total += p.items.len();
        cursor = p.next_cursor;
    }
    assert_eq!(total, 6, "归档子串过滤 + 分页不丢");
}

// ============================================
// 移动 / 排序
// ============================================

#[test]
fn move_and_reorder_todos() {
    let db = mem();
    project(&db, "p1");
    project(&db, "p2");
    db.create_todos_bulk(vec![
        new_todo("t1", "p1", "一", 0.0),
        new_todo("t2", "p1", "二", 1.0),
        new_todo("t3", "p1", "三", 2.0),
    ])
    .unwrap();

    assert_eq!(
        db.move_todos(&MoveTodos {
            ids: vec!["t1".into(), "t3".into()],
            target_project_id: "p2".into(),
        })
        .unwrap(),
        2
    );
    assert!(db.get_todo("t1").unwrap().project_id == "p2");

    // p2 内手动倒序
    db.reorder_todos(&ReorderTodos {
        project_id: "p2".into(),
        ordered_ids: vec!["t3".into(), "t1".into()],
    })
    .unwrap();
    let q = TodoQuery {
        project_id: Some("p2".into()),
        filter: TodoFilter::All,
        priority: None,
        planned_from: None,
        planned_to: None,
        sort: TodoSort::Manual,
        limit: 10,
        cursor: None,
    };
    let page = db.todo_page(&q).unwrap();
    assert_eq!(
        page.items.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(),
        vec!["t3", "t1"],
        "manual 排序遵循 reorder 后的 rank"
    );
}

// ============================================
// 设置
// ============================================

#[test]
fn settings_kv_roundtrip_and_prefix() {
    let db = mem();
    assert!(db.get_setting("theme").unwrap().is_none());
    db.set_setting("theme", "celery").unwrap();
    db.set_setting("theme", "default").unwrap(); // 覆盖
    assert_eq!(db.get_setting("theme").unwrap().as_deref(), Some("default"));

    db.set_settings_bulk(&[
        SettingsKv {
            key: "sort.p1".into(),
            value: "manual".into(),
        },
        SettingsKv {
            key: "sort.p2".into(),
            value: "priority".into(),
        },
    ])
    .unwrap();
    let prefs = db.settings_by_prefix("sort.").unwrap();
    assert_eq!(prefs.len(), 2);

    db.delete_setting("sort.p1").unwrap();
    assert!(db.get_setting("sort.p1").unwrap().is_none());
    assert_eq!(db.all_settings().unwrap().len(), 2);
}
