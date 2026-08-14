//! v3 schema 与迁移框架。
//!
//! - 版本记录在独立的 `schema_migrations` 表，从 1 开始；
//!   不复用 2.x 的 `settings.dataVersion`（3.0 全新数据库）。
//! - 每个迁移在单事务内执行，`schema_migrations` 插入与 DDL 同事务提交，
//!   崩溃/回滚后可安全重放（幂等：已应用的版本直接跳过）。

use crate::clock::now_iso;
use crate::error::{CeleryDbError, Result};

use rusqlite::Connection;

/// (version, name, sql) —— sql 内允许多条语句，用 `execute_batch` 执行。
/// 约定：已发布的迁移永不修改，只追加新条目。
const MIGRATIONS: &[(i64, &str, &str)] = &[(1, "v3-initial", include_str!("schema/v3_initial.sql"))];

/// 当前 schema 版本（最后一个迁移的版本号）。
pub const LATEST_VERSION: i64 = if MIGRATIONS.is_empty() {
    0
} else {
    MIGRATIONS[MIGRATIONS.len() - 1].0
};

/// 确保 `schema_migrations` 表存在并返回当前已应用版本。
fn current_version(conn: &Connection) -> Result<i64> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name     TEXT NOT NULL,
            applied_at TEXT NOT NULL
        );",
    )?;
    let v: Option<i64> = conn
        .query_row("SELECT MAX(version) FROM schema_migrations", [], |r| {
            r.get(0)
        })
        .map_err(|e| CeleryDbError::Migration {
            version: 0,
            message: e.to_string(),
        })?;
    Ok(v.unwrap_or(0))
}

/// 应用所有未执行的迁移（幂等）。
pub fn migrate(conn: &mut Connection) -> Result<i64> {
    let tx = conn.transaction()?;
    let version = {
        let applied = current_version(&tx)?;
        for (version, name, sql) in MIGRATIONS {
            if *version <= applied {
                continue;
            }
            tx.execute_batch(sql).map_err(|e| CeleryDbError::Migration {
                version: *version,
                message: e.to_string(),
            })?;
            tx.execute(
                "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?1, ?2, ?3)",
                rusqlite::params![version, name, now_iso()],
            )
            .map_err(|e| CeleryDbError::Migration {
                version: *version,
                message: e.to_string(),
            })?;
        }
        current_version(&tx)?
    };
    tx.commit()?;
    Ok(version)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrate_is_idempotent() {
        let mut conn = Connection::open_in_memory().unwrap();
        let v1 = migrate(&mut conn).unwrap();
        let v2 = migrate(&mut conn).unwrap();
        assert_eq!(v1, LATEST_VERSION);
        assert_eq!(v1, v2);
        let rows: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM schema_migrations WHERE version = ?1",
                rusqlite::params![LATEST_VERSION],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(rows, 1, "重复迁移不得重复记录版本");
    }
}
