/**
 * @file GeneralSection - 设置页「通用」子页面
 * @description 主题（外观）切换。从 SettingsPanel 拆出，保持"哑组件 + 父级接线"分层。
 */

import type { ThemeMode } from '../../../types';
import { SunIcon, MoonIcon, MonitorIcon } from '../../common/Icons';

interface GeneralSectionProps {
  theme: ThemeMode;
  onUpdateSettings: (updates: { theme: ThemeMode }) => void;
}

const themeOptions: { value: ThemeMode; label: string; icon: typeof SunIcon }[] = [
  { value: 'light', label: '浅色', icon: SunIcon },
  { value: 'dark', label: '深色', icon: MoonIcon },
  { value: 'system', label: '跟随系统', icon: MonitorIcon },
];

export function GeneralSection({ theme, onUpdateSettings }: GeneralSectionProps) {
  return (
    <section>
      <h3 className="claude-eyebrow mb-3" style={{ color: 'var(--text-secondary)' }}>
        外观
      </h3>
      <div className="grid grid-cols-3 gap-2">
        {themeOptions.map((option) => {
          const Icon = option.icon;
          const isActive = theme === option.value;
          return (
            <button
              key={option.value}
              onClick={() => onUpdateSettings({ theme: option.value })}
              className="flex flex-col items-center gap-2 p-3 rounded-lg border transition-all"
              style={{
                borderColor: isActive ? 'var(--accent)' : 'var(--border-color)',
                backgroundColor: isActive ? 'var(--accent-subtle)' : 'transparent',
              }}
            >
              <Icon
                size={20}
                style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}
              />
              <span
                className="text-xs font-medium"
                style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}
              >
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
