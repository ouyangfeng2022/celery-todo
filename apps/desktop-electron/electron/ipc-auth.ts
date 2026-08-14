/**
 * @file IPC 调用方校验工具
 * @description 所有 renderer 共用 preload 时，按窗口类型限制敏感 IPC 的调用范围。
 */

import type { IpcMainInvokeEvent } from 'electron';

/** IPC 调用方是否具备某项操作权限。 */
export type IpcSenderValidator = (event: IpcMainInvokeEvent) => boolean;

/**
 * 拒绝不属于授权窗口的 IPC 调用。
 *
 * 不能只依赖 contextIsolation：贴图窗口同样加载 preload，因而需要在主进程
 * 再做一次授权判断，避免贴图页面调用主窗口专属的系统级操作。
 */
export function requireAuthorizedSender(
  event: IpcMainInvokeEvent,
  isAuthorized: IpcSenderValidator,
): void {
  if (!isAuthorized(event)) {
    throw new Error('当前窗口无权调用此操作');
  }
}
