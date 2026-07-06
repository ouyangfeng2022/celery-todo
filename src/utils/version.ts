/**
 * @file 应用版本号统一出口
 * @description 暴露构建期由 Vite define 注入的 __APP_VERSION__ 全局常量，
 *              避免业务代码直接引用魔法全局变量。版本号的单一源是
 *              package.json 的 `version` 字段；Electron 主进程通过
 *              `app.getVersion()` 读取同一来源。
 *
 *              详见仓库根目录 VERSIONING.md。
 */

/**
 * 应用版本号（SemVer 字符串，例如 "1.0.0"）。
 *
 * - 构建期确定，运行时只读。
 * - 在 Vitest 单元测试环境中（未经 Vite build），会回退为空字符串。
 */
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';
