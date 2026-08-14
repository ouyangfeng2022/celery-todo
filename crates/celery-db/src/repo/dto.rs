//! DTO：Rust 仓储 ↔ Tauri 命令 ↔ TypeScript 之间的强类型边界。
//!
//! - serde 承载 Rust 侧序列化；ts-rs 生成对应 TS 类型到
//!   `packages/data/src/generated/`（`cargo test` 时刷新，CI 校验不漂移）。
//! - 字段命名约定 camelCase（serde 与 ts-rs 双标注 rename_all），
//!   与 2.x TS 实体保持一致。
//! - "可清空字段"（description 等）用双层 Option：外层 None = 不修改，
//!   JSON null = 清空（见 `double_option`）。

use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// 双层 Option：JSON 缺失 → None（不改），JSON null → Some(None)（清空）。
/// 序列化侧配合 `skip_serializing_if = "double_option::is_none"`，
/// 未设置的字段不出现在 JSON 里（否则 Rust→TS 方向会把"未设置"误传为"清空"）。
pub mod double_option {
    use super::*;

    pub fn is_none<T>(v: &Option<Option<T>>) -> bool {
        v.is_none()
    }

    pub fn serialize<T, S>(v: &Option<Option<T>>, s: S) -> Result<S::Ok, S::Error>
    where
        T: Serialize,
        S: Serializer,
    {
        match v {
            Some(inner) => inner.serialize(s),
            None => s.serialize_none(),
        }
    }

    pub fn deserialize<'de, T, D>(de: D) -> Result<Option<Option<T>>, D::Error>
    where
        T: Deserialize<'de>,
        D: Deserializer<'de>,
    {
        Ok(Some(Option::<T>::deserialize(de)?))
    }
}

// ============================================
// 枚举
// ============================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[ts(rename_all = "lowercase")]
#[ts(export, export_to = "../../../packages/data/src/generated/")]
pub enum TodoPriority {
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[ts(rename_all = "lowercase")]
#[ts(export, export_to = "../../../packages/data/src/generated/")]
pub enum ProjectKind {
    User,
    Inbox,
    Weekly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[ts(rename_all = "lowercase")]
#[ts(export, export_to = "../../../packages/data/src/generated/")]
pub enum TodoFilter {
    #[default]
    All,
    Active,
    Completed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../../packages/data/src/generated/")]
pub enum TodoSort {
    #[default]
    #[serde(rename = "created-desc")]
    #[ts(rename = "created-desc")]
    CreatedDesc,
    #[serde(rename = "priority")]
    #[ts(rename = "priority")]
    Priority,
    #[serde(rename = "manual")]
    #[ts(rename = "manual")]
    Manual,
}

// ============================================
// 实体
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/data/src/generated/")]
pub struct TodoDto {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub description: Option<String>,
    pub completed: bool,
    pub priority: TodoPriority,
    /// 本地日历日 YYYY-MM-DD，无时间/时区语义
    pub planned_date: Option<String>,
    pub pinned: bool,
    /// 手动排序稀疏值（拖拽取中点）
    pub rank: f64,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/data/src/generated/")]
pub struct ArchivedTodoDto {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub description: Option<String>,
    pub completed: bool,
    pub priority: TodoPriority,
    pub planned_date: Option<String>,
    pub pinned: bool,
    pub rank: f64,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    /// 归档时间（ISO）
    pub archived_at: String,
    /// 归档时项目名快照（项目可能已被删除）
    pub project_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/data/src/generated/")]
pub struct ProjectDto {
    pub id: String,
    pub name: String,
    pub kind: ProjectKind,
    pub color: Option<String>,
    pub rank: f64,
    pub created_at: String,
    pub updated_at: String,
    /// 项目归档时间；活跃项目为 null
    pub archived_at: Option<String>,
}

// ============================================
// 写入载荷
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/data/src/generated/")]
pub struct NewTodo {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub description: Option<String>,
    pub priority: TodoPriority,
    pub planned_date: Option<String>,
    pub pinned: bool,
    pub rank: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/data/src/generated/")]
pub struct TodoPatch {
    #[ts(optional)]
    pub title: Option<String>,
    #[serde(default, with = "double_option", skip_serializing_if = "double_option::is_none")]
    #[ts(optional, type = "string | null")]
    pub description: Option<Option<String>>,
    #[ts(optional)]
    pub completed: Option<bool>,
    #[ts(optional)]
    pub priority: Option<TodoPriority>,
    #[serde(default, with = "double_option", skip_serializing_if = "double_option::is_none")]
    #[ts(optional, type = "string | null")]
    pub planned_date: Option<Option<String>>,
    #[ts(optional)]
    pub pinned: Option<bool>,
    /// 完成时间由仓储按 completed 自动维护；显式传入用于导入/恢复
    #[serde(default, with = "double_option", skip_serializing_if = "double_option::is_none")]
    #[ts(optional, type = "string | null")]
    pub completed_at: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/data/src/generated/")]
pub struct BatchTodoPatch {
    pub ids: Vec<String>,
    pub patch: TodoPatch,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/data/src/generated/")]
pub struct MoveTodos {
    pub ids: Vec<String>,
    pub target_project_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/data/src/generated/")]
pub struct ReorderTodos {
    pub project_id: String,
    pub ordered_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/data/src/generated/")]
pub struct ReorderProjects {
    pub ordered_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/data/src/generated/")]
pub struct NewProject {
    pub id: String,
    pub name: String,
    pub kind: ProjectKind,
    pub color: Option<String>,
    /// 缺省时追加到末尾（max(rank) + GAP）
    #[ts(optional)]
    pub rank: Option<f64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/data/src/generated/")]
pub struct ProjectPatch {
    #[ts(optional)]
    pub name: Option<String>,
    #[serde(default, with = "double_option", skip_serializing_if = "double_option::is_none")]
    #[ts(optional, type = "string | null")]
    pub color: Option<Option<String>>,
    /// true = 归档，false = 恢复
    #[ts(optional)]
    pub archived: Option<bool>,
}

// ============================================
// 查询与分页
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/data/src/generated/")]
pub struct TodoQuery {
    pub project_id: Option<String>,
    #[serde(default)]
    pub filter: TodoFilter,
    pub priority: Option<TodoPriority>,
    /// 计划日期范围（含端点），YYYY-MM-DD
    pub planned_from: Option<String>,
    pub planned_to: Option<String>,
    #[serde(default)]
    pub sort: TodoSort,
    #[serde(default = "default_page_limit")]
    pub limit: u32,
    pub cursor: Option<String>,
}

pub fn default_page_limit() -> u32 {
    50
}

pub const MAX_PAGE_LIMIT: u32 = 200;

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/data/src/generated/")]
pub struct TodoPage {
    pub items: Vec<TodoDto>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/data/src/generated/")]
pub struct ArchivedTodoPage {
    pub items: Vec<ArchivedTodoDto>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/data/src/generated/")]
pub struct TodoCounts {
    #[ts(type = "number")]
    pub total: u64,
    #[ts(type = "number")]
    pub active: u64,
    #[ts(type = "number")]
    pub completed: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/data/src/generated/")]
pub struct SearchQuery {
    pub term: String,
    pub project_id: Option<String>,
    /// Some(true) 只搜已完成，Some(false) 只搜未完成，None 全部
    pub completed: Option<bool>,
    #[serde(default = "default_page_limit")]
    pub limit: u32,
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/data/src/generated/")]
pub struct ArchivedQuery {
    pub project_id: Option<String>,
    /// 标题/描述子串过滤
    pub term: Option<String>,
    #[serde(default = "default_page_limit")]
    pub limit: u32,
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/data/src/generated/")]
pub struct SettingsKv {
    pub key: String,
    pub value: String,
}
