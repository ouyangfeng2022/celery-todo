//! 自定义数据目录（storageRelocation）：设置页「数据存储位置」的命令面。
//!
//! 配置解析共用 `celery_db::storage_config`（`storage-config.json` 恒在
//! appData 根，db = `<dataDir>/celery-v3.db`，默认 dataDir = appData 根）。
//! 语义对齐 2.x electron/storage.ts：
//! - 切换 = 建目录 + 写权限测试 → 拒绝覆盖已存在同名 db → 拷贝旧库 →
//!   写配置 → 原位置旧文件尽力清理；任一步失败回滚（配置不变、连接原样）。
//! - 重置 = 切回默认目录的同一条路径。
//!
//! 热切换走 `CeleryDb::relocate`：同一把连接锁内 checkpoint → 关旧连接 →
//! 拷贝 → 新路径重开。迁移期间其他窗口的并发命令阻塞等待而非报错，
//! 也不会看到中间状态（比 2.x 关库重连的窗口期更安全）。

use celery_db::{db_filename, CeleryDb};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

use crate::commands::{next_revision, DataChangedEvent, ErrorPayload};

type CmdResult<T> = Result<T, ErrorPayload>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfoDto {
    pub file_path: String,
    pub default_dir: String,
    /// 是否处于自定义目录（false = 默认 appData 根）
    pub customized: bool,
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, ErrorPayload> {
    app.path().app_data_dir().map_err(|e| ErrorPayload {
        kind: "invalid",
        message: format!("appData 目录不可用: {e}"),
    })
}

fn invalid(message: impl Into<String>) -> ErrorPayload {
    ErrorPayload {
        kind: "invalid",
        message: message.into(),
    }
}

/// 规范化比较（目录可能不存在时退回原样比较）。
fn same_path(a: &Path, b: &Path) -> bool {
    let canon = |p: &Path| std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
    canon(a) == canon(b)
}

/// 当前存储信息（设置页展示路径 + 是否自定义）。
#[tauri::command]
pub fn storage_info(app: AppHandle) -> CmdResult<StorageInfoDto> {
    let app_data = app_data_dir(&app)?;
    Ok(StorageInfoDto {
        file_path: celery_db::db_path(&app_data).display().to_string(),
        default_dir: app_data.display().to_string(),
        customized: celery_db::is_custom(&app_data),
    })
}

/// 弹出目录选择对话框；取消返回 None。async + blocking 同
/// export_save_file：阻塞对话框必须离开主线程。
#[tauri::command]
pub async fn storage_choose_directory(
    app: AppHandle,
    window: WebviewWindow,
) -> CmdResult<Option<String>> {
    if window.label() != "main" {
        return Err(invalid("只有主窗口可以更改存储位置"));
    }
    use tauri_plugin_dialog::DialogExt;
    let picked = app
        .dialog()
        .file()
        .blocking_pick_folder()
        .and_then(|p| p.into_path().ok());
    Ok(picked.map(|p| p.display().to_string()))
}

/// 切换/重置共用的迁移流程。返回新 db 路径；失败时配置与连接均已回滚。
fn switch_data_dir(app: &AppHandle, new_dir: &Path) -> Result<PathBuf, ErrorPayload> {
    // E2E 注入了固定库路径时禁止迁移（测试隔离）
    if std::env::var_os("CELERY_DB_PATH").is_some() {
        return Err(invalid("测试环境已注入数据库路径，不支持更改存储位置"));
    }

    let app_data = app_data_dir(app)?;
    let old_data_dir = celery_db::data_dir(&app_data);
    let old_db = old_data_dir.join(db_filename());
    let new_db = new_dir.join(db_filename());

    // 1. 目录存在 + 可写
    std::fs::create_dir_all(new_dir).map_err(|e| invalid(format!("创建目录失败: {e}")))?;
    let probe = new_dir.join(format!(".celery-write-test-{}", std::process::id()));
    std::fs::write(&probe, b"")
        .map_err(|_| invalid(format!("目标目录不可写: {}", new_dir.display())))?;
    let _ = std::fs::remove_file(&probe);

    // 2. 同一目录（规范化后）= 幂等成功：只补写配置，不搬数据
    if same_path(new_dir, &old_data_dir) {
        let dir = if same_path(new_dir, &app_data) {
            None
        } else {
            Some(new_dir)
        };
        celery_db::set_data_dir(&app_data, dir.as_deref())
            .map_err(|e| invalid(format!("写入配置失败: {e}")))?;
        return Ok(new_db);
    }

    // 3. 目标已有同名库 → 拒绝（避免吞掉用户其它数据，对齐 2.x）
    if new_db.exists() {
        return Err(invalid(
            "目标目录已存在同名数据文件，请选择空目录或换一个位置。",
        ));
    }

    let db = app
        .try_state::<CeleryDb>()
        .ok_or_else(|| ErrorPayload {
            kind: "db",
            message: "数据库未初始化".into(),
        })?;

    let sidecars = ["-wal", "-shm"];
    let sidecar_path = |base: &Path, suffix: &str| {
        base.with_file_name(format!("{}{suffix}", db_filename()))
    };

    // 拷贝成功才切配置 —— 崩溃时宁可有孤儿副本，不能让配置指向空库
    let mut copied: Vec<PathBuf> = Vec::new();
    let result = db.relocate(&old_db, &new_db, || -> std::io::Result<()> {
        if old_db.exists() {
            std::fs::copy(&old_db, &new_db)?;
            copied.push(new_db.clone());
        }
        for suffix in sidecars {
            let from = sidecar_path(&old_db, suffix);
            if from.exists() {
                let to = sidecar_path(&new_db, suffix);
                std::fs::copy(&from, &to)?;
                copied.push(to);
            }
        }
        let dir = if same_path(new_dir, &app_data) {
            None
        } else {
            Some(new_dir)
        };
        celery_db::set_data_dir(&app_data, dir.as_deref())
    });

    match result {
        Ok(()) => {
            // 旧位置文件尽力清理（失败不阻塞，用户可手动删）
            let _ = std::fs::remove_file(&old_db);
            for suffix in sidecars {
                let _ = std::fs::remove_file(sidecar_path(&old_db, suffix));
            }
            Ok(new_db)
        }
        Err(e) => {
            // 清理已拷贝的孤儿文件 + 配置恢复旧值（between 可能在写配置前/
            // 后失败，恢复写入恒安全），连接已由 relocate 回滚到旧路径
            for to in &copied {
                let _ = std::fs::remove_file(to);
            }
            let restore = if same_path(&old_data_dir, &app_data) {
                None
            } else {
                Some(old_data_dir.clone())
            };
            let _ = celery_db::set_data_dir(&app_data, restore.as_deref());
            Err(ErrorPayload::from(e))
        }
    }
}

/// 广播全量刷新：source 用非窗口 label，所有窗口（含发起方）都会重载。
fn broadcast_full_refresh(app: &AppHandle) {
    let _ = app.emit(
        "data-changed",
        DataChangedEvent {
            revision: next_revision(),
            source: "storage".to_string(),
            full_refresh: true,
            ..Default::default()
        },
    );
}

/// 切换存储目录（设置页「更改位置」）。
#[tauri::command]
pub async fn storage_set_path(
    app: AppHandle,
    window: WebviewWindow,
    new_dir: String,
) -> CmdResult<String> {
    if window.label() != "main" {
        return Err(invalid("只有主窗口可以更改存储位置"));
    }
    let new_dir = PathBuf::from(new_dir);
    // 文件拷贝可能达秒级（大库），放后台线程避免阻塞异步运行时
    let task_app = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || switch_data_dir(&task_app, &new_dir))
        .await
        .map_err(|e| ErrorPayload {
            kind: "db",
            message: format!("迁移任务异常: {e}"),
        })?;
    let path = result?.display().to_string();
    broadcast_full_refresh(&app);
    Ok(path)
}

/// 重置为默认存储位置（appData 根），数据随迁。
#[tauri::command]
pub async fn storage_reset_to_default(app: AppHandle, window: WebviewWindow) -> CmdResult<String> {
    if window.label() != "main" {
        return Err(invalid("只有主窗口可以重置存储位置"));
    }
    let app_data = app_data_dir(&app)?;
    let task_app = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || switch_data_dir(&task_app, &app_data))
        .await
        .map_err(|e| ErrorPayload {
            kind: "db",
            message: format!("迁移任务异常: {e}"),
        })?;
    let path = result?.display().to_string();
    broadcast_full_refresh(&app);
    Ok(path)
}

/// 在系统文件管理器中定位数据库文件；文件不存在时打开所在目录。
#[tauri::command]
pub fn storage_open_in_folder(app: AppHandle) -> CmdResult<()> {
    let db = celery_db::db_path(&app_data_dir(&app)?);
    if db.exists() {
        tauri_plugin_opener::reveal_item_in_dir(&db).map_err(|e| ErrorPayload {
            kind: "invalid",
            message: format!("打开所在文件夹失败: {e}"),
        })?;
    } else if let Some(dir) = db.parent() {
        tauri_plugin_opener::open_path(dir.display().to_string(), None::<&str>).map_err(|e| {
            ErrorPayload {
                kind: "invalid",
                message: format!("打开目录失败: {e}"),
            }
        })?;
    }
    Ok(())
}
