// 验证页面渲染所需的资源链是否全部可加载
// 注意：sql-wasm.wasm 不再单独检查 —— 它通过 database.ts 的
// `import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'` 由 Vite 托管，
// 构建期会校验资源存在并生成带哈希的 URL，dev 下由 Vite 解析 node_modules 路径。
const checks = [
  ['HTML 入口', 'http://localhost:5173/'],
  ['main.tsx', 'http://localhost:5173/src/main.tsx'],
  ['App.tsx', 'http://localhost:5173/src/App.tsx'],
  ['globals.css', 'http://localhost:5173/src/styles/globals.css'],
  ['database.ts', 'http://localhost:5173/src/utils/database.ts'],
  ['useTodoStore', 'http://localhost:5173/src/store/useTodoStore.ts'],
  ['TodoItem', 'http://localhost:5173/src/components/todos/TodoItem.tsx'],
];

let allOk = true;
for (const [name, url] of checks) {
  const res = await fetch(url);
  const ok = res.ok;
  if (!ok) allOk = false;
  console.log(`${ok ? '✓' : '✗'} ${name}: ${res.status}`);
}
console.log(allOk ? '\n✅ 所有资源加载正常' : '\n❌ 存在加载失败的资源');
