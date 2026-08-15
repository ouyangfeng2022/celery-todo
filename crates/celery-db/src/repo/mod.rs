//! 仓储实现：单一 `CeleryDb` 门面持有连接，业务方法分模块 impl。

pub mod dto;

mod projects;
mod replace;
mod settings;
mod todos;

use std::path::Path;
use std::sync::Mutex;

use crate::error::{CeleryDbError, Result};
use crate::migrations;

/// 稀疏排序的默认步长：新增追加到末尾时 `max(rank) + GAP`，
/// 拖拽插入取相邻两 rank 中点，挤压到阈值以下才整组重排。
pub const RANK_GAP: f64 = 65_536.0;

/// 打开/迁移数据库并应用连接级 PRAGMA。
///
/// - `journal_mode=WAL` 仅对文件库生效（内存库不支持）。
/// - 外键强制开启；`busy_timeout` 5s 覆盖桌面多窗口 / CLI 并发写的短冲突。
pub fn open_connection(path: Option<&Path>) -> Result<rusqlite::Connection> {
    let conn = match path {
        Some(p) => {
            if let Some(dir) = p.parent() {
                std::fs::create_dir_all(dir)?;
            }
            rusqlite::Connection::open(p)?
        }
        None => rusqlite::Connection::open_in_memory()?,
    };
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.busy_timeout(std::time::Duration::from_millis(5_000))?;
    if path.is_some() {
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
    }
    // migrate 需要 &mut（事务），先迁移再交由 CeleryDb 持有
    let mut conn = conn;
    migrations::migrate(&mut conn)?;
    Ok(conn)
}

/// v3 数据库门面。`Mutex` 保证 Tauri 多线程命令下单一写者；
/// 所有公开方法都是业务级操作，不暴露 SQL。
pub struct CeleryDb {
    conn: Mutex<rusqlite::Connection>,
}

/// 分页结果。`next_cursor` 为 None 表示没有下一页；
/// 游标是不透明字符串，只能原样传回下一页查询。
pub struct Page<T> {
    pub items: Vec<T>,
    pub next_cursor: Option<String>,
}

impl CeleryDb {
    /// 打开（或创建并迁移到最新 schema 的）文件数据库。
    pub fn open(path: &Path) -> Result<Self> {
        Ok(Self {
            conn: Mutex::new(open_connection(Some(path))?),
        })
    }

    /// 内存数据库（测试 / 契约测试用）。
    pub fn open_in_memory() -> Result<Self> {
        Ok(Self {
            conn: Mutex::new(open_connection(None)?),
        })
    }

    pub(crate) fn lock_conn(&self) -> Result<std::sync::MutexGuard<'_, rusqlite::Connection>> {
        self.conn
            .lock()
            .map_err(|_| CeleryDbError::Invalid("数据库连接锁中毒".into()))
    }

    /// 当前 schema 版本（schema_migrations 的最大版本）。
    pub fn schema_version(&self) -> Result<i64> {
        let conn = self.lock_conn()?;
        let v: i64 = conn.query_row("SELECT COALESCE(MAX(version), 0) FROM schema_migrations", [], |r| {
            r.get(0)
        })?;
        Ok(v)
    }

    /// 迁移到最新（幂等；用于 CLI / 启动自检）。
    pub fn migrate_to_latest(&self) -> Result<i64> {
        let mut conn = self.lock_conn()?;
        migrations::migrate(&mut conn)
    }

    /// 数据目录迁移原语：checkpoint WAL 后关闭当前连接（释放 db 文件
    /// 句柄，`-wal`/`-shm` 随之清理），执行 `between`（拷贝库文件 + 写
    /// storage-config），成功后在 `new_path` 重开连接；`between` 失败则在
    /// `old_path` 原样重开（连接与数据状态不变，调用方可安全报错重试）。
    ///
    /// 全程持有连接锁 —— 迁移期间其他线程的仓储调用阻塞等待而非报错，
    /// 也看不到中间状态。
    pub fn relocate(
        &self,
        old_path: &Path,
        new_path: &Path,
        between: impl FnOnce() -> std::io::Result<()>,
    ) -> Result<()> {
        let mut guard = self.lock_conn()?;
        let _ = guard.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()));
        // 占位内存库换出旧连接并立即 drop；占位连接不会被执行任何命令
        // （下一步必然被新/旧文件连接替换）。
        let old = std::mem::replace(&mut *guard, rusqlite::Connection::open_in_memory()?);
        drop(old);
        match between() {
            Ok(()) => {
                *guard = open_connection(Some(new_path))?;
                Ok(())
            }
            Err(e) => {
                *guard = open_connection(Some(old_path))?;
                Err(e.into())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relocate_swaps_connection_or_rolls_back() {
        let dir = tempfile::tempdir().unwrap();
        let old = dir.path().join("old.db");
        let new = dir.path().join("new.db");

        let db = CeleryDb::open(&old).unwrap();
        db.set_setting("k", "v").unwrap();

        // 成功路径：between 拷贝文件 → 同一门面已指向新文件，数据可见
        db.relocate(&old, &new, || std::fs::copy(&old, &new).map(|_| ()))
            .unwrap();
        assert!(new.exists());
        assert_eq!(db.get_setting("k").unwrap().as_deref(), Some("v"));

        // 失败路径：between 报错 → 连接回到 old_path（当前文件），数据不丢
        let target = dir.path().join("t.db");
        let err = db
            .relocate(&new, &target, || Err(std::io::Error::other("boom")))
            .unwrap_err();
        assert!(err.to_string().contains("boom"));
        assert!(!target.exists());
        assert_eq!(db.get_setting("k").unwrap().as_deref(), Some("v"));
    }
}
