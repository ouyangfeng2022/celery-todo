//! 设置仓储：key-value 存取应用设置（主题 / 视图 / 模板 / 每项目排序偏好）。
//!
//! 与 2.x 的差异：不再持久化 DB schema 版本（由 schema_migrations 承担），
//! 也不存操作系统级状态（自启 / 更新 / 存储路径归各端平台层）。

use rusqlite::{params, params_from_iter};

use super::dto::SettingsKv;
use super::CeleryDb;
use crate::error::Result;

impl CeleryDb {
    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query(params![key])?;
        Ok(match rows.next()? {
            Some(row) => Some(row.get(0)?),
            None => None,
        })
    }

    /// 写入或覆盖（upsert）。
    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.lock_conn()?;
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) \
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    /// 批量 upsert（单事务，导入设置时使用）。
    pub fn set_settings_bulk(&self, entries: &[SettingsKv]) -> Result<()> {
        if entries.is_empty() {
            return Ok(());
        }
        let mut conn = self.lock_conn()?;
        let tx = conn.transaction()?;
        for kv in entries {
            tx.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2) \
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![kv.key, kv.value],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn all_settings(&self) -> Result<Vec<SettingsKv>> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare("SELECT key, value FROM settings ORDER BY key")?;
        let rows = stmt
            .query_map([], |r| {
                Ok(SettingsKv {
                    key: r.get(0)?,
                    value: r.get(1)?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        Ok(rows)
    }

    /// 按前缀读取（如 `sort.<projectId>` 的每项目排序偏好）。
    pub fn settings_by_prefix(&self, prefix: &str) -> Result<Vec<SettingsKv>> {
        let conn = self.lock_conn()?;
        let mut stmt =
            conn.prepare("SELECT key, value FROM settings WHERE key LIKE ?1 ESCAPE '\\' ORDER BY key")?;
        let pat = format!("{}%", prefix.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"));
        let rows = stmt
            .query_map(params_from_iter([pat]), |r| {
                Ok(SettingsKv {
                    key: r.get(0)?,
                    value: r.get(1)?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        Ok(rows)
    }

    pub fn delete_setting(&self, key: &str) -> Result<()> {
        let conn = self.lock_conn()?;
        conn.execute("DELETE FROM settings WHERE key = ?1", params![key])?;
        Ok(())
    }
}
