//! 更新器网络代理：把「网络代理」设置项映射为 HTTP(S)_PROXY 环境变量。
//!
//! tauri-plugin-updater 底层的 reqwest 只认环境变量代理、不读系统代理，
//! 国内直连 github.com（更新端点）会超时（「error sending request for url」）。
//! 三个设置键：proxyEnabled / proxyMode(system|custom) / proxyUrl。
//! - 启动时 `apply_from_settings` 读库应用一次（setup 里、首个窗口加载前）；
//! - 设置页改动后 renderer 调 `apply_updater_proxy` 命令即时重设 —— updater
//!   每次检查才构建 reqwest client，无需重启即生效。
//! 关闭代理时只移除本会话写入的值，不碰用户 shell 注入的真实环境变量。

use celery_db::CeleryDb;
use std::sync::Mutex;
use tauri::State;

use crate::commands::ErrorPayload;

/// reqwest 读取的代理环境变量（大写形式；Windows 注册表环境无小写惯例）
const PROXY_ENV_KEYS: [&str; 3] = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"];

/// 本会话通过 set_var 写入的代理值（None = 未写入）。
static APPLIED: Mutex<Option<String>> = Mutex::new(None);

/// 启动时应用：读设置 → 写/清环境变量。失败（如自定义地址非法）仅打日志，
/// 不阻断启动。
pub fn apply_from_settings(db: &CeleryDb) {
    match resolve_proxy(db) {
        Ok(proxy) => apply(proxy),
        Err(e) => eprintln!("网络代理设置未生效: {}", e.message),
    }
}

/// 设置页改动网络代理后由 renderer 调用：读库 → 即时重设环境变量。
#[tauri::command]
pub fn apply_updater_proxy(db: State<'_, CeleryDb>) -> Result<(), ErrorPayload> {
    let proxy = resolve_proxy(&db)?;
    apply(proxy);
    Ok(())
}

/// 按设置键解析应生效的代理地址；Ok(None) = 不走代理（直连）。
fn resolve_proxy(db: &CeleryDb) -> Result<Option<String>, ErrorPayload> {
    let get = |key: &str| db.get_setting(key).ok().flatten().unwrap_or_default();
    if get("proxyEnabled") != "true" {
        return Ok(None);
    }
    if get("proxyMode") == "custom" {
        return normalize_custom_url(&get("proxyUrl")).map(Some);
    }
    Ok(system_proxy_url())
}

/// 写入（Some）或撤除（None）代理环境变量。
/// 撤除时只移除上次自己写入、且当前值未被改动的键，避免误删用户环境变量。
fn apply(proxy: Option<String>) {
    let mut applied = APPLIED.lock().unwrap();
    if let Some(prev) = applied.take() {
        for key in PROXY_ENV_KEYS {
            if std::env::var(key).is_ok_and(|v| v == prev) {
                std::env::remove_var(key);
            }
        }
    }
    if let Some(url) = proxy {
        for key in PROXY_ENV_KEYS {
            std::env::set_var(key, &url);
        }
        *applied = Some(url);
    }
}

/// 系统代理地址。Windows 读 WinINET 注册表（Clash 等开启系统代理时写这里）；
/// macOS/Linux 无稳定的系统代理读取途径，返回 None（用户可改用自定义模式）。
#[cfg(windows)]
fn system_proxy_url() -> Option<String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let Ok(settings) = hkcu
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Internet Settings")
    else {
        return None;
    };
    let enabled: u32 = settings.get_value("ProxyEnable").unwrap_or(0);
    if enabled == 0 {
        return None;
    }
    let server: String = settings.get_value("ProxyServer").unwrap_or_default();
    normalize_wininet_server(&server)
}

#[cfg(not(windows))]
fn system_proxy_url() -> Option<String> {
    None
}

/// 归一化 WinINET `ProxyServer` 取值为完整代理 URL：
/// - `127.0.0.1:7890`（全协议共用，Clash 等常见形态）→ 补 `http://` 前缀
/// - `http=host:port;https=host:port`（旧式按协议条目）→ 取 http 条目
/// - socks-only / 空 / 非 http scheme → None（socks 需要额外 feature，不支持）
#[cfg(windows)]
fn normalize_wininet_server(server: &str) -> Option<String> {
    let raw = if server.contains('=') {
        let entry = server
            .split(';')
            .map(str::trim)
            .find(|s| s.starts_with("http="))?;
        entry.strip_prefix("http=")?.trim()
    } else {
        server.trim()
    };
    if raw.is_empty() || (raw.contains("://") && !raw.starts_with("http://")) {
        return None;
    }
    Some(if raw.starts_with("http://") {
        raw.to_string()
    } else {
        format!("http://{raw}")
    })
}

/// 校验并归一化用户输入的自定义代理地址：
/// 接受 `127.0.0.1:7890`（补 http:// 前缀）或 `http://127.0.0.1:7890`；
/// 空值 / socks 等其他 scheme / WinINET 按协议条目 → Err（中文提示进 UI）。
fn normalize_custom_url(url: &str) -> Result<String, ErrorPayload> {
    let invalid = || ErrorPayload {
        kind: "invalid",
        message: "代理地址无效：仅支持 http 代理，如 127.0.0.1:7890 或 http://127.0.0.1:7890".into(),
    };
    let raw = url.trim();
    if raw.is_empty() || raw.contains('=') {
        return Err(invalid());
    }
    if raw.contains("://") {
        return if raw.starts_with("http://") {
            Ok(raw.to_string())
        } else {
            Err(invalid())
        };
    }
    // 无 scheme：要求 host:port 形态（port 必须是数字，挡住裸域名/单词）
    let Some((host, port)) = raw.rsplit_once(':') else {
        return Err(invalid());
    };
    if host.is_empty() || !port.chars().all(|c| c.is_ascii_digit()) || port.is_empty() {
        return Err(invalid());
    }
    Ok(format!("http://{raw}"))
}

#[cfg(test)]
mod tests {
    use super::normalize_custom_url;

    fn err_or_ok(url: &str) -> Option<String> {
        normalize_custom_url(url).ok()
    }

    #[test]
    fn custom_host_port_gets_http_scheme() {
        assert_eq!(
            err_or_ok("127.0.0.1:7890").as_deref(),
            Some("http://127.0.0.1:7890")
        );
    }

    #[test]
    fn custom_schemed_url_passthrough_and_trim() {
        assert_eq!(
            err_or_ok("  http://proxy.local:8080  ").as_deref(),
            Some("http://proxy.local:8080")
        );
    }

    #[test]
    fn custom_rejects_blank_socks_per_protocol_and_bare_host() {
        assert!(err_or_ok("").is_none());
        assert!(err_or_ok("   ").is_none());
        assert!(err_or_ok("socks5://127.0.0.1:1080").is_none());
        assert!(err_or_ok("http=127.0.0.1:7890;https=127.0.0.1:7890").is_none());
        assert!(err_or_ok("proxy.local").is_none());
    }
}

#[cfg(all(test, windows))]
mod windows_tests {
    use super::normalize_wininet_server;

    #[test]
    fn wininet_host_port_gets_http_scheme() {
        assert_eq!(
            normalize_wininet_server("127.0.0.1:7890").as_deref(),
            Some("http://127.0.0.1:7890")
        );
    }

    #[test]
    fn wininet_already_schemed_passthrough() {
        assert_eq!(
            normalize_wininet_server("http://127.0.0.1:7890").as_deref(),
            Some("http://127.0.0.1:7890")
        );
    }

    #[test]
    fn wininet_per_protocol_form_picks_http_entry() {
        assert_eq!(
            normalize_wininet_server("ftp=10.0.0.1:80;http=127.0.0.1:7890;https=127.0.0.1:7890")
                .as_deref(),
            Some("http://127.0.0.1:7890")
        );
    }

    #[test]
    fn wininet_socks_only_blank_and_foreign_scheme_rejected() {
        assert!(normalize_wininet_server("socks=127.0.0.1:1080").is_none());
        assert!(normalize_wininet_server("").is_none());
        assert!(normalize_wininet_server("   ").is_none());
        assert!(normalize_wininet_server("https://proxy.local:8443").is_none());
    }
}
