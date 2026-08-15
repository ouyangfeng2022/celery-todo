/**
 * @file DesktopSection - 设置页「桌面」子页面
 * @description 开机自启 / 最小化到托盘 / 自动检查更新。
 *              从 SettingsPanel 拆出。仅在 window.electronAPI 存在时由父级路由渲染。
 */

interface DesktopSectionProps {
  autoStart: boolean;
  minimizeToTray: boolean;
  autoUpdateEnabled: boolean;
  onUpdateSettings: (updates: {
    autoStart?: boolean;
    minimizeToTray?: boolean;
    autoUpdateEnabled?: boolean;
  }) => void;
}

export function DesktopSection({
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
