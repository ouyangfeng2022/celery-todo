/**
 * @file 异步操作失败统一兜底。
 * @description 仓储层抛 RepositoryError / SQLite 错误时若无人 catch，在 release
 *              包里会被 Hermes 静默吞掉（界面无任何反馈，看似「点了没反应」）。
 *              所有 fire-and-forget 的数据操作都应挂 .catch(alertError)。
 */

import { Alert } from 'react-native';

/** 弹出操作失败提示（message 取 Error.message 或字符串化值）。 */
export function alertError(e: unknown, title = '操作失败'): void {
  Alert.alert(title, e instanceof Error ? e.message : String(e));
}
