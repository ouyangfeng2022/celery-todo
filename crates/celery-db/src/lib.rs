//! # celery-db
//!
//! Celery Todo 3.0 的 v3 SQLite 数据层：schema、迁移与仓储。
//!
//! 设计约束（见 3.0 重构计划）：
//! - 全新 `schema_migrations` 版本 1 起，不复用 2.x `settings.dataVersion`。
//! - `deleted_todos` 重命名为 `archived_todos`（历史记录语义），不再有 `expires_at`。
//! - 保留 UUID 主键、计划日期、置顶、项目类型与稀疏数值 rank。
//! - WAL + 外键 + busy_timeout；批量写入必须单事务。
//! - 搜索走 FTS5；列表 / 搜索 / 归档一律游标分页，任何端不整库加载。
//!
//! 该 crate 被 Tauri 桌面端（强类型命令桥）与 Rust CLI 共用；
//! DTO 通过 ts-rs 生成 TypeScript 绑定到 `packages/data/src/generated/`，
//! CI 校验生成物不漂移。

mod clock;
mod cursor;
mod error;
mod migrations;
mod repo;

pub use error::{CeleryDbError, Result};
pub use repo::{CeleryDb, Page};

// DTO 既有 serde（Rust 侧 IPC 序列化）又有 TS（生成 TS 绑定），
// 统一在 dto.rs 定义并从这里再导出。
pub mod dto {
    pub use crate::repo::dto::*;
}
