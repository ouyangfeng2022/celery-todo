/**
 * @file ShortcutsSection - 设置页「快捷键」子页面
 * @description 只读的快捷键说明列表。从 SettingsPanel 拆出。
 */

const SHORTCUTS: [string, string][] = [
  ['Ctrl + N', '新建事项'],
  ['Ctrl + F', '搜索'],
  ['Ctrl + S', '保存'],
  ['Ctrl + B', '切换侧边栏'],
  ['Ctrl + D', '切换主题'],
  ['Ctrl + 1/2/3', '切换筛选视图'],
  ['Esc', '取消编辑'],
  ['Ctrl + Shift + N', '新建项目'],
  ['Ctrl + Shift + I', '导入数据'],
  ['Ctrl + Shift + E', '导出全部数据'],
  ['Ctrl + Shift + L', '导出当前列表'],
  ['Ctrl + Shift + K', '进入简洁模式'],
];

export function ShortcutsSection() {
  return (
    <section>
      <h3 className="claude-eyebrow mb-3" style={{ color: 'var(--text-secondary)' }}>
        键盘快捷键
      </h3>
      <div className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        {SHORTCUTS.map(([key, desc]) => (
          <div key={key} className="flex items-center justify-between">
            <span>{desc}</span>
            <kbd
              className="px-2 py-0.5 rounded font-mono text-[11px]"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-tertiary)',
                border: '1px solid var(--border-color)',
              }}
            >
              {key}
            </kbd>
          </div>
        ))}
      </div>
    </section>
  );
}
