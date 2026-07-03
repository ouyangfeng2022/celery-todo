/**
 * sql.js 浏览器 WASM 构建的类型声明
 */
declare module 'sql.js/dist/sql-wasm-browser.js' {
  import type { SqlJsStatic, Database } from 'sql.js';

  interface InitSqlJsOptions {
    locateFile?: (file: string) => string;
  }

  const initSqlJs: (options?: InitSqlJsOptions) => Promise<SqlJsStatic>;
  export default initSqlJs;
  export { Database, SqlJsStatic };
}
