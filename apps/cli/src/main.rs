//! Celery Todo 3.0 CLI —— 与 Tauri 桌面端读写同一个 v3 数据库。
//!
//! 数据文件：`<系统配置目录>/com.celery.todo/celery-v3.db`，与桌面端
//! `app_data_dir` 一致（Windows `%APPDATA%\com.celery.todo`）。
//!
//! 已知边界（3.0 计划）：CLI 写入后桌面的实时刷新依赖同用户本地 IPC
//! （RepositoryChangeFeed 的桌面实现），该桥接在桌面 UI 里程碑接入；
//! 当前桌面重启后可见全部 CLI 写入。

use celery_db::dto::{NewTodo, TodoFilter, TodoPatch, TodoQuery, TodoSort};
use celery_db::CeleryDb;
use clap::{Parser, Subcommand};
use std::path::PathBuf;

/// v3 数据库文件位置（与 Tauri identifier 对应的 appData 目录）。
pub fn default_db_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.celery.todo")
        .join("celery-v3.db")
}

#[derive(Parser)]
#[command(
    name = "celery",
    version,
    about = "Celery Todo 3.0 命令行：快速增删事项，与桌面端共用数据"
)]
struct Cli {
    /// 覆盖数据库文件路径（默认与桌面端一致）
    #[arg(long, global = true)]
    db: Option<PathBuf>,

    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// 显示当前使用的数据库路径与统计
    Status,
    /// 列出项目
    Projects,
    /// 列出事项（默认活跃；--all 含已完成）
    List {
        /// 按项目名过滤
        #[arg(long)]
        project: Option<String>,
        #[arg(long)]
        all: bool,
        /// 标题/描述子串过滤
        #[arg(long)]
        term: Option<String>,
    },
    /// 添加事项（默认进收集箱；--project 按名指定，不存在时创建）
    Add {
        title: String,
        #[arg(long)]
        project: Option<String>,
        #[arg(long, default_value = "medium")]
        priority: String,
    },
    /// 完成事项（按 id 前缀匹配）
    Done { id: String },
    /// 归档事项（按 id 前缀匹配）
    Archive { id: String },
}

fn open(db_arg: Option<&PathBuf>) -> Result<CeleryDb, String> {
    let path = db_arg.cloned().unwrap_or_else(default_db_path);
    CeleryDb::open(&path).map_err(|e| format!("打开数据库失败（{}）: {e}", path.display()))
}

fn resolve_priority(raw: &str) -> Result<celery_db::dto::TodoPriority, String> {
    match raw {
        "high" | "h" => Ok(celery_db::dto::TodoPriority::High),
        "medium" | "m" => Ok(celery_db::dto::TodoPriority::Medium),
        "low" | "l" => Ok(celery_db::dto::TodoPriority::Low),
        other => Err(format!("未知优先级 {other}（high/medium/low）")),
    }
}

/// id 前缀唯一匹配；0 个或多个都报错并列出候选。
fn match_todo_prefix(db: &CeleryDb, prefix: &str) -> Result<String, String> {
    let page = db
        .todo_page(&TodoQuery {
            project_id: None,
            filter: TodoFilter::All,
            priority: None,
            planned_from: None,
            planned_to: None,
            sort: TodoSort::CreatedDesc,
            limit: 200,
            cursor: None,
        })
        .map_err(|e| e.to_string())?;
    let hits: Vec<_> = page
        .items
        .iter()
        .filter(|t| t.id.starts_with(prefix))
        .collect();
    match hits.as_slice() {
        [one] => Ok(one.id.clone()),
        [] => Err(format!("没有找到 id 以 “{prefix}” 开头的事项")),
        many => Err(format!(
            "“{prefix}” 匹配到 {} 条（{}…），请输入更长的前缀",
            many.len(),
            many[0].id
        )),
    }
}

fn run(cli: Cli) -> Result<(), String> {
    let db = open(cli.db.as_ref())?;
    match cli.command {
        Command::Status => {
            let counts = db.todo_counts(None).map_err(|e| e.to_string())?;
            println!("数据库: {}", default_db_path().display());
            println!(
                "事项: {}（活跃 {}，已完成 {}）",
                counts.total, counts.active, counts.completed
            );
        }
        Command::Projects => {
            for p in db.list_projects(false).map_err(|e| e.to_string())? {
                println!("{}\t{}", p.id, p.name);
            }
        }
        Command::List { project, all, term } => {
            let pid = match &project {
                None => None,
                Some(name) => {
                    let projects = db.list_projects(false).map_err(|e| e.to_string())?;
                    let hit = projects.iter().find(|p| p.name == *name);
                    match hit {
                        Some(p) => Some(p.id.clone()),
                        None => return Err(format!("项目 “{name}” 不存在")),
                    }
                }
            };
            let mut query = TodoQuery {
                project_id: pid,
                filter: if all { TodoFilter::All } else { TodoFilter::Active },
                priority: None,
                planned_from: None,
                planned_to: None,
                sort: TodoSort::CreatedDesc,
                limit: 200,
                cursor: None,
            };
            let mut page = db.todo_page(&query).map_err(|e| e.to_string())?;
            let mut items = page.items.clone();
            // 分页取全（CLI 场景量级有限，200/页足够）
            while let Some(cursor) = page.next_cursor.clone() {
                query.cursor = Some(cursor);
                page = db.todo_page(&query).map_err(|e| e.to_string())?;
                items.extend(page.items.clone());
            }
            let term = term.as_deref().map(str::to_lowercase);
            for t in items {
                if let Some(needle) = &term {
                    let hay = format!(
                        "{} {}",
                        t.title,
                        t.description.as_deref().unwrap_or("")
                    )
                    .to_lowercase();
                    if !hay.contains(needle) {
                        continue;
                    }
                }
                let mark = if t.completed { 'x' } else { ' ' };
                println!("{}  {}\t{}{}", mark, &t.id[..8], t.title, if t.pinned { " 📌" } else { "" });
            }
        }
        Command::Add { title, project, priority } => {
            let priority = resolve_priority(&priority)?;
            let project_id = match &project {
                None => db.ensure_inbox().map_err(|e| e.to_string())?.id,
                Some(name) => {
                    let projects = db.list_projects(false).map_err(|e| e.to_string())?;
                    match projects.iter().find(|p| p.name == *name) {
                        Some(p) => p.id.clone(),
                        None => {
                            let created = db
                                .create_project(celery_db::dto::NewProject {
                                    id: uuid::Uuid::new_v4().to_string(),
                                    name: name.clone(),
                                    kind: celery_db::dto::ProjectKind::User,
                                    color: None,
                                    rank: None,
                                })
                                .map_err(|e| e.to_string())?;
                            created.id
                        }
                    }
                }
            };
            let max_rank = 0.0f64; // 追加语义：rank 递增交给中点/重排；这里用时间戳保证新事项在前
            let todo = db
                .create_todo(NewTodo {
                    id: uuid::Uuid::new_v4().to_string(),
                    project_id,
                    title,
                    description: None,
                    priority,
                    planned_date: None,
                    pinned: false,
                    rank: max_rank,
                })
                .map_err(|e| e.to_string())?;
            println!("已添加 {} {}", &todo.id[..8], todo.title);
        }
        Command::Done { id } => {
            let full = match_todo_prefix(&db, &id)?;
            let mut patch = TodoPatch::default();
            patch.completed = Some(true);
            let t = db.update_todo(&full, &patch).map_err(|e| e.to_string())?;
            println!("已完成 {} {}", &t.id[..8], t.title);
        }
        Command::Archive { id } => {
            let full = match_todo_prefix(&db, &id)?;
            db.archive_todos(&[full]).map_err(|e| e.to_string())?;
            println!("已归档 {id}");
        }
    }
    Ok(())
}

fn main() {
    let cli = Cli::parse();
    if let Err(e) = run(cli) {
        eprintln!("错误: {e}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn priority_aliases() {
        assert!(matches!(resolve_priority("h").unwrap(), celery_db::dto::TodoPriority::High));
        assert!(matches!(resolve_priority("low").unwrap(), celery_db::dto::TodoPriority::Low));
        assert!(resolve_priority("urgent").is_err());
    }

    #[test]
    fn prefix_matching_on_real_db() {
        let db = CeleryDb::open_in_memory().unwrap();
        let inbox = db.ensure_inbox().unwrap();
        for i in 0..3 {
            db.create_todo(NewTodo {
                id: format!("todo-{i:04}"),
                project_id: inbox.id.clone(),
                title: format!("事项 {i}"),
                description: None,
                priority: celery_db::dto::TodoPriority::Medium,
                planned_date: None,
                pinned: false,
                rank: i as f64,
            })
            .unwrap();
        }
        assert_eq!(match_todo_prefix(&db, "todo-0002").unwrap(), "todo-0002");
        assert!(match_todo_prefix(&db, "zzz").is_err());
        // "todo-0" 匹配多条 → 报错要求更长前缀
        assert!(match_todo_prefix(&db, "todo-0").is_err());
    }
}
