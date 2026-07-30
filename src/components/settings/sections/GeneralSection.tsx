/**
 * @file GeneralSection - 设置页「通用」子页面
 * @description 主题配色与明暗模式分别选择，跟随系统不会重置当前配色。
 */

import type { ThemeMode, ThemeName } from '../../../types';
import { SunIcon, MoonIcon, MonitorIcon, PaperIcon, SparkleIcon } from '../../common/Icons';

interface GeneralSectionProps {
  theme: ThemeName;
  colorMode: ThemeMode;
  onUpdateSettings: (updates: { theme?: ThemeName; colorMode?: ThemeMode }) => void;
}

const themeOptions: { value: ThemeName; label: string; icon: typeof SunIcon }[] = [
  { value: 'default', label: '默认', icon: SunIcon },
  { value: 'paper', label: '经典', icon: PaperIcon },
  { value: 'celery', label: '芹绿', icon: SparkleIcon },
];

const colorModeOptions: { value: ThemeMode; label: string; icon: typeof SunIcon }[] = [
  { value: 'light', label: '浅色', icon: SunIcon },
  { value: 'dark', label: '深色', icon: MoonIcon },
  { value: 'system', label: '跟随系统', icon: MonitorIcon },
];

export function GeneralSection({ theme, colorMode, onUpdateSettings }: GeneralSectionProps) {
  return (
    <section>
      <h3 className="claude-eyebrow mb-3" style={{ color: 'var(--text-secondary)' }}>
        外观
      </h3>
      <div className="space-y-5">
        <ThemeGroup
          title="主题"
          options={themeOptions}
          activeValue={theme}
          onSelect={(value) => onUpdateSettings({ theme: value })}
        />
        <ThemeGroup
          title="明暗模式"
          options={colorModeOptions}
          activeValue={colorMode}
          onSelect={(value) => onUpdateSettings({ colorMode: value })}
        />
      </div>
    </section>
  );
}

interface ThemeGroupProps<T extends string> {
  title: string;
  options: { value: T; label: string; icon: typeof SunIcon }[];
  activeValue: T;
  onSelect: (value: T) => void;
}

function ThemeGroup<T extends string>({
  title,
  options,
  activeValue,
  onSelect,
}: ThemeGroupProps<T>) {
  return (
    <div>
      <p className="mb-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        {title}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => {
          const Icon = option.icon;
          const isActive = activeValue === option.value;
          return (
            <button
              key={option.value}
              onClick={() => onSelect(option.value)}
              className="flex flex-col items-center gap-2 rounded-lg border p-3 transition-all"
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
    </div>
  );
}
