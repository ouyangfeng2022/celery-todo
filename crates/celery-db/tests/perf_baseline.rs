//! 性能夹具基线（p95 回归门）。
//!
//! 用固定规模的夹具库（100 项目 × 500 事项 + 1 万归档）对热路径采样，
//! p95 超过阈值即失败 —— 阈值取实测的 5–10 倍余量，只拦数量级回归
//! （丢索引、全表扫描、事务退化），不追击毫秒级抖动。
//!
//! 跳过：`CELERY_SKIP_PERF=1 cargo test --test perf_baseline`
//! （慢机器本地开发可跳过；CI 始终运行）。

use celery_db::dto::*;
use celery_db::CeleryDb;
use std::time::{Duration, Instant};

/// 采样次数：p95 = 排序后第 95 百分位（向上取整索引）。
const SAMPLES: usize = 40;

fn p95(mut samples: Vec<Duration>) -> Duration {
    samples.sort();
    samples[samples.len() - samples.len() / 20]
}

fn should_skip() -> bool {
    std::env::var("CELERY_SKIP_PERF").map(|v| v == "1").unwrap_or(false)
}

/// 夹具库：临时文件（WAL + synchronous=NORMAL，与桌面端一致）。
fn fixture() -> (CeleryDb, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let db = CeleryDb::open(&dir.path().join("perf.db")).unwrap();

    let mut todo_batch = 0u64;
    for p in 0..100 {
        let pid = format!("p{p:03}");
        db.create_project(NewProject {
            id: pid.clone(),
            name: format!("项目 {p:03}"),
            kind: ProjectKind::User,
            color: None,
            rank: Some(p as f64 * 65_536.0),
        })
        .unwrap();

        let items: Vec<NewTodo> = (0..500)
            .map(|t| NewTodo {
                id: format!("{pid}-t{t:04}"),
                project_id: pid.clone(),
                title: format!("事项 {p:03}-{t:04} celery 夹具"),
                description: if t % 10 == 0 {
                    Some(format!("描述内容 {t}，用于搜索命中 perf"))
                } else {
                    None
                },
                priority: match t % 3 {
                    0 => TodoPriority::High,
                    1 => TodoPriority::Medium,
                    _ => TodoPriority::Low,
                },
                planned_date: Some(format!("2026-{:02}-{:02}", t % 12 + 1, t % 28 + 1)),
                pinned: t % 97 == 0,
                rank: t as f64 * 65_536.0,
            })
            .collect();
        todo_batch += db.create_todos_bulk(items).unwrap();
    }

    // 1 万条归档：前 20 个项目各归档 500 条
    let mut archive_ids = Vec::new();
    for p in 0..20 {
        let pid = format!("p{p:03}");
        let page = db
            .todo_page(&TodoQuery {
                project_id: Some(pid),
                filter: TodoFilter::All,
                priority: None,
                planned_from: None,
                planned_to: None,
                sort: TodoSort::Manual,
                limit: 200,
                cursor: None,
            })
            .unwrap();
        archive_ids.extend(page.items.iter().map(|t| t.id.clone()));
    }
    db.archive_todos(&archive_ids).unwrap();
    assert_eq!(todo_batch, 50_000);
    (db, dir)
}

fn assert_p95(label: &str, samples: Vec<Duration>, budget: Duration) {
    let measured = p95(samples);
    assert!(
        measured < budget,
        "性能回归门: {} p95 = {:?} ≥ 预算 {:?}（CELERY_SKIP_PERF=1 可跳过）",
        label,
        measured,
        budget
    );
}

#[test]
fn perf_baseline_p95_gate() {
    if should_skip() {
        eprintln!("CELERY_SKIP_PERF=1，跳过性能基线");
        return;
    }
    let (db, _keep) = fixture();

    // --- 1) 分页查询（首页 50 条，覆盖最热路径） ---
    let mut samples = Vec::with_capacity(SAMPLES);
    for i in 0..SAMPLES {
        let pid = format!("p{:03}", i % 100);
        let start = Instant::now();
        db.todo_page(&TodoQuery {
            project_id: Some(pid),
            filter: TodoFilter::Active,
            priority: None,
            planned_from: None,
            planned_to: None,
            sort: TodoSort::Manual,
            limit: 50,
            cursor: None,
        })
        .unwrap();
        samples.push(start.elapsed());
    }
    assert_p95("todo_page(50)", samples, Duration::from_millis(50));

    // --- 2) FTS 搜索（trigram 命中标题） ---
    let mut samples = Vec::with_capacity(SAMPLES);
    for i in 0..SAMPLES {
        let term = format!("事项 {i:03}");
        let start = Instant::now();
        let hits = db
            .search_todos(&SearchQuery {
                term,
                project_id: None,
                completed: None,
                limit: 50,
                cursor: None,
            })
            .unwrap();
        assert!(!hits.items.is_empty());
        samples.push(start.elapsed());
    }
    assert_p95("search_todos", samples, Duration::from_millis(150));

    // --- 3) 单条创建（单事务提交，含 WAL） ---
    let mut samples = Vec::with_capacity(SAMPLES);
    for i in 0..SAMPLES {
        let start = Instant::now();
        db.create_todo(NewTodo {
            id: format!("create-{i:03}"),
            project_id: "p050".into(),
            title: format!("创建性能样本 {i}"),
            description: None,
            priority: TodoPriority::Medium,
            planned_date: None,
            pinned: false,
            rank: 1e12 + i as f64,
        })
        .unwrap();
        samples.push(start.elapsed());
    }
    assert_p95("create_todo", samples, Duration::from_millis(25));

    // --- 4) 整组重排（500 id 单事务） ---
    let page = db
        .todo_page(&TodoQuery {
            project_id: Some("p050".into()),
            filter: TodoFilter::All,
            priority: None,
            planned_from: None,
            planned_to: None,
            sort: TodoSort::Manual,
            limit: 200,
            cursor: None,
        })
        .unwrap();
    let mut ordered: Vec<String> = page.items.iter().map(|t| t.id.clone()).collect();
    // 翻页取满 500
    let mut cursor = page.next_cursor;
    while ordered.len() < 500 {
        let next = db
            .todo_page(&TodoQuery {
                project_id: Some("p050".into()),
                filter: TodoFilter::All,
                priority: None,
                planned_from: None,
                planned_to: None,
                sort: TodoSort::Manual,
                limit: 200,
                cursor,
            })
            .unwrap();
        ordered.extend(next.items.iter().map(|t| t.id.clone()));
        cursor = next.next_cursor;
        if cursor.is_none() {
            break;
        }
    }
    let mut samples = Vec::with_capacity(SAMPLES);
    for i in 0..SAMPLES {
        let mut ids = ordered.clone();
        let n = i % ids.len();
        ids.rotate_left(n);
        let start = Instant::now();
        db.reorder_todos(&ReorderTodos {
            project_id: "p050".into(),
            ordered_ids: ids,
        })
        .unwrap();
        samples.push(start.elapsed());
    }
    assert_p95("reorder_todos(500)", samples, Duration::from_millis(200));

    // --- 5) 归档分页（1 万条上的 keyset 续页） ---
    let first = db
        .archived_page(&ArchivedQuery {
            project_id: None,
            term: None,
            limit: 50,
            cursor: None,
        })
        .unwrap();
    let mut samples = Vec::with_capacity(SAMPLES);
    let mut cursor = first.next_cursor.clone();
    for _ in 0..SAMPLES {
        let start = Instant::now();
        let page = db
            .archived_page(&ArchivedQuery {
                project_id: None,
                term: None,
                limit: 50,
                cursor: cursor.clone(),
            })
            .unwrap();
        cursor = page.next_cursor.or(first.next_cursor.clone());
        samples.push(start.elapsed());
    }
    assert_p95("archived_page", samples, Duration::from_millis(50));

    // --- 6) 全量替换（万级行单事务；debug 构建的 SQLite 绑定比 release 慢约
    //     10 倍，实测 ~5.5s，预算按 debug 放宽，release 下余量更大） ---
    let start = Instant::now();
    db.replace_all(&ReplaceAllPayload {
        projects: vec![ReplaceProject {
            id: "np".into(),
            name: "替换后".into(),
            kind: ProjectKind::User,
            color: None,
            rank: 0.0,
            created_at: "2026-08-15T00:00:00.000Z".into(),
            updated_at: "2026-08-15T00:00:00.000Z".into(),
        }],
        todos: (0..10_000)
            .map(|t| ReplaceTodo {
                id: format!("nt{t:05}"),
                project_id: "np".into(),
                title: format!("替换事项 {t}"),
                description: None,
                completed: t % 2 == 0,
                priority: TodoPriority::Low,
                planned_date: None,
                pinned: false,
                rank: t as f64,
                created_at: "2026-08-15T00:00:00.000Z".into(),
                updated_at: "2026-08-15T00:00:00.000Z".into(),
                completed_at: None,
            })
            .collect(),
        archived_todos: Vec::new(),
        settings: vec![SettingsKv {
            key: "theme".into(),
            value: "celery".into(),
        }],
    })
    .unwrap();
    let elapsed = start.elapsed();
    assert!(
        elapsed < Duration::from_secs(15),
        "性能回归门: replace_all(1万) = {:?} ≥ 预算 15s",
        elapsed
    );
}
