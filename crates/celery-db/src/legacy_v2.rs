//! 2.x Electron 旧库（`.db`）导入：inspect + 事务性导入到 v3。
//!
//! 这是 3.0 与 2.x 的**唯一兼容入口**（Windows 首次启动向导使用）：
//! - 只接受 `settings.dataVersion` 4–9；更早/更晚/缺失一律报告不支持。
//! - 源库以只读方式打开，绝不写 2.x 数据。
//! - 导入在目标 v3 库的**单事务**内完成：任一步失败整体回滚，
//!   目标保持空白（等价于"临时库转换成功后原子替换"，且免去对已打开
//!   WAL 连接做文件替换的竞态处理）；源库永远不动。
//! - 保留实体 ID、时间戳、计划日期、置顶与 sort_order（→ rank）；
//!   `deleted_todos` → `archived_todos`，丢弃 `expires_at`。
//! - 设置只按白名单导入（主题/模板/视图/每项目排序）；
//!   自启、更新状态、存储路径等 OS 级设置不进 v3。
//! - 活跃事项存在孤儿引用（项目缺失）时**终止**导入，不静默丢数据；
//!   归档事项的孤儿引用允许保留（带项目名快照）。

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags};

use crate::clock::now_iso;
use crate::error::{CeleryDbError, Result};
use crate::repo::dto::{LegacyV2Counts, LegacyV2ImportResult, LegacyV2Report};

/// 支持导入的 dataVersion 范围（含端点）。
pub const SUPPORTED_MIN_VERSION: i64 = 4;
pub const SUPPORTED_MAX_VERSION: i64 = 9;

/// 2.x 数据库文件名（存储目录内）。
const V2_DB_FILENAME: &str = "celery-todo.db";
/// 2.x 自定义存储位置配置文件（userData 根目录下）。
const V2_CONFIG_FILENAME: &str = "storage-config.json";

/// 设置导入白名单：主题 / 模板 / 视图 / 每项目排序偏好。
/// 明确排除：autoStart、autoUpdateEnabled、minimizeToTray（OS/平台行为）、
/// dataVersion（v3 由 schema_migrations 管理）、storage*（存储路径）。
const SETTINGS_WHITELIST: &[&str] = &[
    "theme",
    "colorMode",
    "focusMode",
    "lastActiveProjectId",
    "customTemplates",
    "todoViewMode",
    "showWeeklyProjects",
    "timeFormat",
    "stickerPreset",
    "stickerRadius",
    "stickerBlur",
    "stickerOpacity",
    "stickerShadow",
];
/// 前缀白名单（2.x 的每项目排序偏好 `sort.<projectId>`）。
const SETTINGS_PREFIX_WHITELIST: &[&str] = &["sort."];

// ============================================
// inspect
// ============================================

fn open_readonly(path: &Path) -> std::result::Result<Connection, String> {
    Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("无法打开数据库文件: {e}"))
}

fn table_columns(conn: &Connection, table: &str) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    let Ok(mut stmt) = conn.prepare(&format!("PRAGMA table_info({table})")) else {
        return out;
    };
    if let Ok(rows) = stmt.query_map([], |r| r.get::<_, String>(1)) {
        for col in rows.flatten() {
            out.insert(col);
        }
    }
    out
}

/// 表存在且包含必需列；返回 (存在, 缺失列描述)。
fn check_table(conn: &Connection, table: &str, required: &[&str]) -> Option<String> {
    let cols = table_columns(conn, table);
    if cols.is_empty() {
        return Some(format!("缺少表 {table}"));
    }
    let missing: Vec<&str> = required.iter().filter(|c| !cols.contains(**c)).copied().collect();
    if missing.is_empty() {
        None
    } else {
        Some(format!("表 {table} 缺少列: {}", missing.join(", ")))
    }
}

/// 检查 2.x 源库并生成报告。**永不返回 Err** —— 所有问题都进报告（供向导展示）。
pub fn inspect_v2(path: &Path) -> LegacyV2Report {
    let mut report = LegacyV2Report {
        path: path.display().to_string(),
        supported: false,
        data_version: 0,
        integrity_ok: false,
        counts: None,
        warnings: Vec::new(),
        blocker: None,
    };
    let blocker = |msg: String, r: &mut LegacyV2Report| {
        if r.blocker.is_none() {
            r.blocker = Some(msg);
        }
    };

    let conn = match open_readonly(path) {
        Ok(c) => c,
        Err(e) => {
            blocker(format!("{e}（文件不存在或不是 SQLite 数据库）"), &mut report);
            return report;
        }
    };

    // 1. 完整性
    match conn.query_row("PRAGMA integrity_check", [], |r| r.get::<_, String>(0)) {
        Ok(result) if result == "ok" => report.integrity_ok = true,
        Ok(result) => blocker(format!("完整性检查未通过: {result}"), &mut report),
        Err(e) => blocker(format!("完整性检查失败: {e}"), &mut report),
    }

    // 2. 表结构与版本
    for (table, required) in [
        ("projects", vec!["id", "name", "created_at", "updated_at"]),
        ("todos", vec!["id", "project_id", "title", "created_at"]),
        (
            "deleted_todos",
            vec!["id", "project_id", "title", "deleted_at"],
        ),
        ("settings", vec!["key", "value"]),
    ] {
        if let Some(msg) = check_table(&conn, table, &required) {
            blocker(msg, &mut report);
        }
    }
    if let Ok(v) = conn.query_row(
        "SELECT value FROM settings WHERE key = 'dataVersion'",
        [],
        |r| r.get::<_, String>(0),
    ) {
        report.data_version = v.parse().unwrap_or(0);
    }
    if report.data_version < SUPPORTED_MIN_VERSION {
        blocker(
            format!(
                "数据库版本过旧（dataVersion={}，支持 {}–{}）；请先用 2.x 最新版打开一次再导出",
                report.data_version, SUPPORTED_MIN_VERSION, SUPPORTED_MAX_VERSION
            ),
            &mut report,
        );
    } else if report.data_version > SUPPORTED_MAX_VERSION {
        blocker(
            format!(
                "数据库版本无法识别（dataVersion={}，支持 {}–{}）",
                report.data_version, SUPPORTED_MIN_VERSION, SUPPORTED_MAX_VERSION
            ),
            &mut report,
        );
    }

    if report.blocker.is_some() {
        return report;
    }

    // 3. 行数与警告（可选列缺失、孤儿数据）
    let count = |sql: &str| -> u64 {
        conn.query_row(sql, [], |r| r.get::<_, i64>(0)).unwrap_or(0) as u64
    };
    report.counts = Some(LegacyV2Counts {
        projects: count("SELECT COUNT(*) FROM projects"),
        todos: count("SELECT COUNT(*) FROM todos"),
        archived_todos: count("SELECT COUNT(*) FROM deleted_todos"),
        settings: count("SELECT COUNT(*) FROM settings"),
    });

    for (table, col) in [
        ("projects", "sort_order"),
        ("projects", "kind"),
        ("todos", "pinned"),
        ("todos", "planned_date"),
        ("deleted_todos", "project_name"),
    ] {
        if !table_columns(&conn, table).contains(col) {
            report
                .warnings
                .push(format!("旧版本缺列 {table}.{col}，导入时使用默认值"));
        }
    }

    let orphan_todos = count(
        "SELECT COUNT(*) FROM todos t LEFT JOIN projects p ON p.id = t.project_id \
         WHERE p.id IS NULL",
    );
    if orphan_todos > 0 {
        blocker(
            format!("有 {orphan_todos} 条活跃事项引用了不存在的项目（数据损坏），无法导入"),
            &mut report,
        );
    }
    let orphan_archived = count(
        "SELECT COUNT(*) FROM deleted_todos d LEFT JOIN projects p ON p.id = d.project_id \
         WHERE p.id IS NULL AND d.project_name IS NULL",
    );
    if orphan_archived > 0 {
        report.warnings.push(format!(
            "有 {orphan_archived} 条归档事项的原项目已删除且无名称快照，将保留但项目名显示为空"
        ));
    }

    report.supported = report.blocker.is_none();
    report
}

// ============================================
// import
// ============================================

/// 源库某表的 SELECT 表达式：列存在用列名，缺失用默认值字面量。
fn column_expr(cols: &BTreeSet<String>, table_alias: &str, col: &str, default: &str) -> String {
    if cols.contains(col) {
        format!("{table_alias}.\"{col}\"")
    } else {
        default.to_string()
    }
}

/// 路径 → 只读 ATTACH URI（file:...?mode=ro），保证源库绝不因导入被写入。
fn source_uri(path: &Path) -> String {
    let mut uri = String::from("file:");
    for b in path.to_string_lossy().replace('\\', "/").bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b':' | b'/' | b'.' | b'_' | b'-' => {
                uri.push(b as char)
            }
            _ => uri.push_str(&format!("%{b:02X}")),
        }
    }
    uri.push_str("?mode=ro");
    uri
}

impl crate::repo::CeleryDb {
    /// 把 2.x 源库导入到当前（必须为空的）v3 库。
    /// 单事务：失败整体回滚，目标保持空白；源库以只读 ATTACH 挂载，不受影响。
    pub fn import_from_v2(&self, source: &Path) -> Result<LegacyV2ImportResult> {
        let report = inspect_v2(source);
        if !report.supported {
            return Err(CeleryDbError::Invalid(
                report.blocker.unwrap_or_else(|| "源库不支持导入".into()),
            ));
        }

        let mut conn = self.lock_conn()?;

        // 目标必须为空白（首次启动、默认内容创建之前）
        for table in ["projects", "todos", "archived_todos"] {
            let n: i64 = conn
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
                .unwrap_or(0);
            if n > 0 {
                return Err(CeleryDbError::Invalid(format!(
                    "目标数据库已存在数据（{table} {n} 行）；2.x 导入仅在首次启动的空库上进行"
                )));
            }
        }

        // 源库以只读方式 ATTACH 为 v2src；列形状探测在源库上进行
        let src = open_readonly(source)
            .map_err(|e| CeleryDbError::Invalid(format!("打开源库失败: {e}")))?;
        let p_cols = table_columns(&src, "projects");
        let t_cols = table_columns(&src, "todos");
        let d_cols = table_columns(&src, "deleted_todos");
        drop(src);
        conn.execute("ATTACH DATABASE ?1 AS v2src", rusqlite::params![source_uri(source)])?;

        let import = import_attached(&mut conn, &p_cols, &t_cols, &d_cols, &src_settings(source));
        // 无论成败都卸载源库（DETACH 不能在事务内执行，事务已随上面结束）
        let _ = conn.execute("DETACH DATABASE v2src", []);
        import
    }
}

/// 读取源库 settings（独立只读连接；ATTACH 连接由主流程管理）。
fn src_settings(source: &Path) -> Vec<(String, String)> {
    let Ok(conn) = open_readonly(source) else {
        return Vec::new();
    };
    let Ok(mut stmt) = conn.prepare("SELECT key, value FROM settings") else {
        return Vec::new();
    };
    stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map(|rows| rows.flatten().collect())
        .unwrap_or_default()
}

/// 事务主体：跨库 INSERT ... SELECT（目标表 ← v2src.源表）。
fn import_attached(
    conn: &mut Connection,
    p_cols: &BTreeSet<String>,
    t_cols: &BTreeSet<String>,
    d_cols: &BTreeSet<String>,
    src_settings: &[(String, String)],
) -> Result<LegacyV2ImportResult> {
        let tx = conn.transaction()?;

        // ---- projects：sort_order → rank，kind 缺省 user ----
        let projects = tx.execute(
            &format!(
                "INSERT INTO projects (id, name, kind, color, rank, created_at, updated_at) \
                 SELECT p.id, p.name, {}, {}, {}, p.created_at, p.updated_at FROM v2src.projects p",
                column_expr(&p_cols, "p", "kind", "'user'"),
                column_expr(&p_cols, "p", "color", "NULL"),
                column_expr(&p_cols, "p", "sort_order", "0"),
            ),
            [],
        )? as u64;

        // ---- todos：保留 ID/时间/优先级/计划日期/置顶/sort_order ----
        let todos = tx.execute(
            &format!(
                "INSERT INTO todos (id, project_id, title, description, completed, priority, \
                 planned_date, pinned, rank, created_at, updated_at, completed_at) \
                 SELECT t.id, t.project_id, t.title, {}, t.completed, \
                 COALESCE({}, 'medium'), {}, {}, {}, t.created_at, t.updated_at, {} \
                 FROM v2src.todos t",
                column_expr(&t_cols, "t", "description", "NULL"),
                column_expr(&t_cols, "t", "priority", "NULL"),
                column_expr(&t_cols, "t", "planned_date", "NULL"),
                column_expr(&t_cols, "t", "pinned", "0"),
                column_expr(&t_cols, "t", "sort_order", "0"),
                column_expr(&t_cols, "t", "completed_at", "NULL"),
            ),
            [],
        )? as u64;

        // ---- deleted_todos → archived_todos：deleted_at → archived_at，丢弃 expires_at ----
        let archived = tx.execute(
            &format!(
                "INSERT INTO archived_todos (id, project_id, title, description, completed, \
                 priority, planned_date, pinned, rank, created_at, updated_at, completed_at, \
                 archived_at, project_name) \
                 SELECT d.id, d.project_id, d.title, {}, d.completed, \
                 COALESCE({}, 'medium'), {}, {}, {}, d.created_at, d.updated_at, {}, \
                 d.deleted_at, COALESCE({}, (SELECT p.name FROM v2src.projects p WHERE p.id = d.project_id)) \
                 FROM v2src.deleted_todos d",
                column_expr(&d_cols, "d", "description", "NULL"),
                column_expr(&d_cols, "d", "priority", "NULL"),
                column_expr(&d_cols, "d", "planned_date", "NULL"),
                column_expr(&d_cols, "d", "pinned", "0"),
                column_expr(&d_cols, "d", "sort_order", "0"),
                column_expr(&d_cols, "d", "completed_at", "NULL"),
                column_expr(&d_cols, "d", "project_name", "NULL"),
            ),
            [],
        )? as u64;

        // ---- settings：白名单 + sort.* 前缀；其余跳过并记录 ----
        let mut imported_settings = 0u64;
        let mut skipped = BTreeSet::new();
        for (key, value) in src_settings {
            let allowed = SETTINGS_WHITELIST.contains(&key.as_str())
                || SETTINGS_PREFIX_WHITELIST
                    .iter()
                    .any(|p| key.starts_with(p));
            if allowed {
                tx.execute(
                    "INSERT INTO settings (key, value) VALUES (?1, ?2) \
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    rusqlite::params![key, value],
                )?;
                imported_settings += 1;
            } else if key != "dataVersion" {
                skipped.insert(key.clone());
            }
        }

        // ---- 确保收集箱存在（源库理论上必有；缺失则补一个空收集箱）----
        let has_inbox: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM projects WHERE kind = 'inbox')",
                [],
                |r| r.get(0),
            )
            .unwrap_or(false);
        if !has_inbox {
            let max_rank: f64 = tx
                .query_row("SELECT COALESCE(MAX(rank), -65536.0) FROM projects", [], |r| {
                    r.get(0)
                })
                .unwrap_or(-65536.0);
            tx.execute(
                "INSERT INTO projects (id, name, kind, color, rank, created_at, updated_at) \
                 VALUES (?1, '收集箱', 'inbox', NULL, ?2, ?3, ?3)",
                rusqlite::params![
                    uuid::Uuid::new_v4().to_string(),
                    max_rank + 65536.0,
                    now_iso()
                ],
            )?;
        }

        tx.commit()?;

        Ok(LegacyV2ImportResult {
            projects,
            todos,
            archived_todos: archived,
            settings: imported_settings,
            skipped_settings: skipped.into_iter().collect(),
        })
}

// ============================================
// 自动探测 2.x 数据库路径
// ============================================

/// 探测 2.x 默认数据库文件（计划第 6 步：自动探测默认目录与
/// `storage-config.json` 指向的自定义目录；也可在向导中手动选取）。
///
/// 2.x Electron userData 目录：Windows `%APPDATA%/celery-todo`，
/// macOS `~/Library/Application Support/celery-todo`，Linux `~/.config/celery-todo`。
/// 返回第一个真实存在的候选；找不到返回 None。
pub fn detect_v2_source() -> Option<PathBuf> {
    let user_data = dirs::config_dir()?.join("celery-todo");

    let mut candidates: Vec<PathBuf> = Vec::new();
    // 自定义存储位置优先
    let config = user_data.join(V2_CONFIG_FILENAME);
    if let Ok(raw) = std::fs::read_to_string(&config) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(dir) = json.get("dataDir").and_then(|v| v.as_str()) {
                let dir = dir.trim();
                if !dir.is_empty() {
                    candidates.push(PathBuf::from(dir).join(V2_DB_FILENAME));
                }
            }
        }
    }
    // 默认 userData/data 兜底
    candidates.push(user_data.join("data").join(V2_DB_FILENAME));

    candidates.into_iter().find(|p| p.is_file())
}
