// 验证页面渲染所需的资源链是否全部可加载
const checks = [
  ['HTML 入口', 'http://localhost:5173/'],
  ['main.tsx', 'http://localhost:5173/src/main.tsx'],
  ['App.tsx', 'http://localhost:5173/src/App.tsx'],
  ['globals.css', 'http://localhost:5173/src/styles/globals.css'],
  ['database.ts', 'http://localhost:5173/src/utils/database.ts'],
  ['useTodoStore', 'http://localhost:5173/src/store/useTodoStore.ts'],
  ['TodoItem', 'http://localhost:5173/src/components/todos/TodoItem.tsx'],
  ['sql-wasm.wasm', 'http://localhost:5173/sql-wasm.wasm'],
];

let allOk = true;
for (const [name, url] of checks) {
  const res = await fetch(url);
  const ok = res.ok;
  if (!ok) allOk = false;
  console.log(`${ok ? '✓' : '✗'} ${name}: ${res.status}`);
}
console.log(allOk ? '\n✅ 所有资源加载正常' : '\n❌ 存在加载失败的资源');
