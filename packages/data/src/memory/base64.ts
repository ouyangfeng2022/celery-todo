/**
 * 无环境依赖的 base64 编解码（浏览器 / Node / RN 通用）。
 * 内存适配器的游标只包含 ASCII（ISO 时间戳、uuid、数字），无需考虑非 ASCII。
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64Encode(input: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) bytes.push(input.charCodeAt(i) & 0xff);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b = [bytes[i], bytes[i + 1] ?? 0, bytes[i + 2] ?? 0];
    const n = (b[0] << 16) | (b[1] << 8) | b[2];
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? ALPHABET[n & 63] : '=';
  }
  return out;
}

export function base64Decode(input: string): string {
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const ch of input) {
    if (ch === '=') break;
    const v = ALPHABET.indexOf(ch);
    if (v === -1) throw new Error('invalid base64');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((acc >> bits) & 0xff);
    }
  }
  return out;
}
