//! 错误类型：单一 enum 覆盖 SQLite / 迁移 / 校验 / 未找到。

use thiserror::Error;

pub type Result<T> = std::result::Result<T, CeleryDbError>;

#[derive(Debug, Error)]
pub enum CeleryDbError {
    #[error("数据库错误: {0}")]
    Db(#[from] rusqlite::Error),

    #[error("文件系统错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("迁移失败 (v{version}): {message}")]
    Migration { version: i64, message: String },

    #[error("实体不存在: {0}")]
    NotFound(String),

    #[error("参数无效: {0}")]
    Invalid(String),

    #[error("游标无效或不属于当前查询: {0}")]
    BadCursor(String),

    #[error("序列化错误: {0}")]
    Serde(#[from] serde_json::Error),
}
