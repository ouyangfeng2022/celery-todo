//! 自定义数据目录配置：`storage-config.json` 恒位于 appData 根，
//! 记录当前数据目录；数据库文件固定为 `<dataDir>/celery-v3.db`。
//!
//! 语义对齐 2.x electron/storage.ts：
//! - 默认数据目录 = appData 根本身（3.0.0/3.0.1 老用户库就在那里，不搬家）。
//! - 配置缺失/损坏一律回退默认目录，永不因配置问题拒绝启动。
//! - 只有用户显式切换过位置才会产生配置文件。
//!
//! 该模块被 Tauri 桌面端（setup 解析 + storage 命令）与 Rust CLI
//! （db 路径解析）共用 —— 两端必须指向同一个文件，否则目录迁移后
//! CLI 会开到旧位置造成数据分叉。

use std::path::{Path, PathBuf};

const CONFIG_FILENAME: &str = "storage-config.json";
const DB_FILENAME: &str = "celery-v3.db";

/// 数据库文件名（在数据目录内）。
pub fn db_filename() -> &'static str {
    DB_FILENAME
}

fn config_path(app_data: &Path) -> PathBuf {
    app_data.join(CONFIG_FILENAME)
}

/// 当前数据目录：读配置，缺失/损坏/为空时回退 appData 根。
pub fn data_dir(app_data: &Path) -> PathBuf {
    let configured = std::fs::read_to_string(config_path(app_data))
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|v| {
            v.get("dataDir")
                .and_then(|d| d.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(PathBuf::from)
        });
    configured.unwrap_or_else(|| app_data.to_path_buf())
}

/// 当前数据库文件完整路径。
pub fn db_path(app_data: &Path) -> PathBuf {
    data_dir(app_data).join(DB_FILENAME)
}

/// 是否配置了自定义数据目录。
pub fn is_custom(app_data: &Path) -> bool {
    data_dir(app_data) != app_data
}

/// 写入自定义数据目录；`None` 删除配置（回到默认）。
pub fn set_data_dir(app_data: &Path, dir: Option<&Path>) -> std::io::Result<()> {
    match dir {
        Some(d) => {
            let cfg = serde_json::json!({ "dataDir": d.display().to_string() });
            std::fs::create_dir_all(app_data)?;
            std::fs::write(
                config_path(app_data),
                serde_json::to_vec_pretty(&cfg).expect("序列化 dataDir 不可能失败"),
            )
        }
        None => {
            // 配置不存在时删除也是成功（幂等）
            match std::fs::remove_file(config_path(app_data)) {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(e) => Err(e),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "celery-storage-config-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn default_when_config_missing() {
        let app_data = temp_dir();
        assert!(!is_custom(&app_data));
        assert_eq!(db_path(&app_data), app_data.join("celery-v3.db"));
        std::fs::remove_dir_all(&app_data).ok();
    }

    #[test]
    fn falls_back_on_corrupt_config() {
        let app_data = temp_dir();
        std::fs::write(config_path(&app_data), "{not json").unwrap();
        assert!(!is_custom(&app_data));
        std::fs::remove_dir_all(&app_data).ok();
    }

    #[test]
    fn roundtrip_custom_dir() {
        let app_data = temp_dir();
        let custom = app_data.join("somewhere").join("else");
        set_data_dir(&app_data, Some(&custom)).unwrap();
        assert!(is_custom(&app_data));
        assert_eq!(data_dir(&app_data), custom);
        assert_eq!(db_path(&app_data), custom.join("celery-v3.db"));

        set_data_dir(&app_data, None).unwrap();
        assert!(!is_custom(&app_data));
        // 再次删除（配置已不存在）仍成功
        set_data_dir(&app_data, None).unwrap();
        std::fs::remove_dir_all(&app_data).ok();
    }

    #[test]
    fn empty_string_dir_falls_back() {
        let app_data = temp_dir();
        std::fs::write(
            config_path(&app_data),
            serde_json::to_string(&serde_json::json!({ "dataDir": "  " })).unwrap(),
        )
        .unwrap();
        assert!(!is_custom(&app_data));
        std::fs::remove_dir_all(&app_data).ok();
    }
}
