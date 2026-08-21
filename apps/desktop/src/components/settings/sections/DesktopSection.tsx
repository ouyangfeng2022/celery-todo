/**
 * @file DesktopSection - 设置页「桌面」子页面
 * @description 启动时打开 / 开机自启 / 最小化到托盘 / 自动检查更新。
 *              从 SettingsPanel 拆出。仅在 window.electronAPI 存在时由父级路由渲染。
 */

interface DesktopSectionProps {
  startupWindow: 'main' | 'sticker';
  autoStart: boolean;
  minimizeToTray: boolean;
  autoUpdateEnabled: boolean;
  onUpdateSettings: (updates: {
    startupWindow?: 'main' | 'sticker';
    autoStart?: boolean;
    minimizeToTray?: boolean;
    autoUpdateEnabled?: boolean;
  }) => void;
}

export function DesktopSection({
  startupWindow,
  autoStart,
  minimizeToTray,
  autoUpdateEnabled,
  onUpdateSettings,
}: DesktopSectionProps) {
  return (
    <div className="space-y-7">
      <section>
        <h3 className="claude-eyebrow mb-3" style={{ color: 'var(--text-secondary)' }}>
          桌面应用
        </h3>
        <div className="flex items-center justify-between py-2">
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
            启动时打开
          </span>
          <select
            value={startupWindow}
            onChange={(e) =>
              onUpdateSettings({ startupWindow: e.target.value as 'main' | 'sticker' })
            }
            className="rounded-md border-none px-2.5 py-1.5 text-[13px] cursor-pointer transition-colors"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
            }}
          >
            <option value="main">主窗口</option>
            <option value="sticker">简洁模式浮窗</option>
          </select>
        </div>
        <label className="flex items-center justify-between py-2 cursor-pointer">
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
            开机自启动
          </span>
          <input
            type="checkbox"
            checked={autoStart}
            onChange={(e) => onUpdateSettings({ autoStart: e.target.checked })}
            className="w-4 h-4 accent-[var(--accent)]"
          />
        </label>
        <label className="flex items-center justify-between py-2 cursor-pointer">
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
            关闭时最小化到托盘
          </span>
          <input
            type="checkbox"
            checked={minimizeToTray}
            onChange={(e) => onUpdateSettings({ minimizeToTray: e.target.checked })}
            className="w-4 h-4 accent-[var(--accent)]"
          />
        </label>
        <label className="flex items-center justify-between py-2 cursor-pointer">
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
            启动时自动检查更新
          </span>
          <input
            type="checkbox"
            checked={autoUpdateEnabled}
            onChange={(e) => onUpdateSettings({ autoUpdateEnabled: e.target.checked })}
            className="w-4 h-4 accent-[var(--accent)]"
          />
        </label>
      </section>
    </div>
  );
}
