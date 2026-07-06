/// <reference types="vite/client" />

/**
 * 应用版本号全局常量声明。
 *
 * 由 vite.config.ts 的 `define` 在构建期注入字符串字面量，
 * 取自 package.json 的 `version` 字段（应用版本号的唯一源）。
 * 运行时统一通过 `@/utils/version` 暴露的 APP_VERSION 读取，
 * 业务代码请勿直接引用本全局变量。
 */
declare const __APP_VERSION__: string;
