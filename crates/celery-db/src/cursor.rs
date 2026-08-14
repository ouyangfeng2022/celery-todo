//! 不透明游标：base64url(JSON payload)。
//!
//! 游标对调用方是黑盒 —— 只能由上一次分页结果的 `next_cursor` 原样传回。
//! payload 记录排序键的边界值，供 keyset 分页比较；
//! 解码失败或排序方式与 payload 不符视为 `BadCursor`。

use crate::error::{CeleryDbError, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorPayload {
    /// 生成游标时的排序方式；换排序后旧游标必须失效。
    pub sort: String,
    /// 该排序下的键边界值（按 ORDER BY 顺序）。
    pub keys: Vec<String>,
}

const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

pub fn encode(payload: &CursorPayload) -> Result<String> {
    let json = serde_json::to_vec(payload)?;
    Ok(base64_url_encode(&json))
}

pub fn decode(sort: &str, cursor: &str) -> Result<CursorPayload> {
    let bytes = base64_url_decode(cursor)
        .ok_or_else(|| CeleryDbError::BadCursor(cursor.to_string()))?;
    let payload: CursorPayload = serde_json::from_slice(&bytes)
        .map_err(|_| CeleryDbError::BadCursor(cursor.to_string()))?;
    if payload.sort != sort {
        return Err(CeleryDbError::BadCursor(format!(
            "游标排序 ({}) 与查询排序 ({}) 不符",
            payload.sort, sort
        )));
    }
    Ok(payload)
}

fn base64_url_encode(input: &[u8]) -> String {
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b = [
            chunk[0],
            chunk.get(1).copied().unwrap_or(0),
            chunk.get(2).copied().unwrap_or(0),
        ];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(ALPHABET[(n >> 18) as usize & 63] as char);
        out.push(ALPHABET[(n >> 12) as usize & 63] as char);
        if chunk.len() > 1 {
            out.push(ALPHABET[(n >> 6) as usize & 63] as char);
        }
        if chunk.len() > 2 {
            out.push(ALPHABET[n as usize & 63] as char);
        }
    }
    out
}

fn base64_url_decode(input: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(input.len() * 3 / 4);
    let mut acc: u32 = 0;
    let mut bits = 0u32;
    for ch in input.bytes() {
        let v = ALPHABET.iter().position(|&a| a == ch)? as u32;
        acc = (acc << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
        }
    }
    // 容忍编码端的 zero-padding 语义差异：多余的零字节不影响 JSON 解析
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let p = CursorPayload {
            sort: "created-desc".into(),
            keys: vec!["2026-08-14T00:00:00.000Z".into(), "id-1".into()],
        };
        let s = encode(&p).unwrap();
        assert!(decode("created-desc", &s).is_ok());
        assert!(decode("manual", &s).is_err(), "排序不符必须拒绝");
        assert!(decode("created-desc", "!!!not-base64!!!").is_err());
    }
}
