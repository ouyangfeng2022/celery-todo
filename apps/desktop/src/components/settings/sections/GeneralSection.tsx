/**
 * @file GeneralSection - 设置页「通用」子页面
 * @description 主题配色与明暗模式分别选择，跟随系统不会重置当前配色。
 */

import type { ThemeMode, ThemeName } from '../../../types';
import { SunIcon, MoonIcon, MonitorIcon, PaperIcon, SparkleIcon } from '../../common/Icons';

interface GeneralSectionProps {
  theme: ThemeName;
  colorMode: ThemeMode;
  showWeeklyProjects: boolean;
  completedSinkToBottom: boolean;
  showTimeLabels: boolean;
  showAllDoneCelebration: boolean;
  onUpdateSettings: (updates: {
    theme?: ThemeName;
    colorMode?: ThemeMode;
    showWeeklyProjects?: boolean;
    completedSinkToBottom?: boolean;
    showTimeLabels?: boolean;
    showAllDoneCelebration?: boolean;
  }) => void;
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

export function GeneralSection({
  theme,
  colorMode,
  showWeeklyProjects,
  completedSinkToBottom,
  showTimeLabels,
  showAllDoneCelebration,
  onUpdateSettings,
}: GeneralSectionProps) {
  return (
    <div className="space-y-7">
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

      <section>
        <h3 className="claude-eyebrow mb-3" style={{ color: 'var(--text-secondary)' }}>
          项目列表
        </h3>
        <label className="flex cursor-pointer items-center justify-between gap-6 py-2">
          <span>
            <span className="block text-sm" style={{ color: 'var(--text-primary)' }}>
              显示自动创建项目
            </span>
            <span className="mt-1 block text-xs" style={{ color: 'var(--text-tertiary)' }}>
              在侧栏显示旧版本的周计划项目
            </span>
          </span>
          <input
            type="checkbox"
            checked={showWeeklyProjects}
            onChange={(event) => onUpdateSettings({ showWeeklyProjects: event.target.checked })}
            className="h-4 w-4 flex-shrink-0 accent-[var(--accent)]"
          />
        </label>
      </section>

      <section>
        <h3 className="claude-eyebrow mb-3" style={{ color: 'var(--text-secondary)' }}>
          事项列表
        </h3>
        <div className="space-y-1">
          <label className="flex cursor-pointer items-center justify-between gap-6 py-2">
            <span>
              <span className="block text-sm" style={{ color: 'var(--text-primary)' }}>
                已完成沉底
              </span>
              <span className="mt-1 block text-xs" style={{ color: 'var(--text-tertiary)' }}>
                「全部」视图下，已完成事项排在未完成事项后面
              </span>
            </span>
            <input
              type="checkbox"
              checked={completedSinkToBottom}
              onChange={(event) =>
                onUpdateSettings({ completedSinkToBottom: event.target.checked })
              }
              className="h-4 w-4 flex-shrink-0 accent-[var(--accent)]"
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-6 py-2">
            <span>
              <span className="block text-sm" style={{ color: 'var(--text-primary)' }}>
                显示时间标签
              </span>
              <span className="mt-1 block text-xs" style={{ color: 'var(--text-tertiary)' }}>
                列表事项行显示创建与完成时间
              </span>
            </span>
            <input
              type="checkbox"
              checked={showTimeLabels}
              onChange={(event) => onUpdateSettings({ showTimeLabels: event.target.checked })}
              className="h-4 w-4 flex-shrink-0 accent-[var(--accent)]"
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-6 py-2">
            <span>
              <span className="block text-sm" style={{ color: 'var(--text-primary)' }}>
                全部完成庆祝
              </span>
              <span className="mt-1 block text-xs" style={{ color: 'var(--text-tertiary)' }}>
                项目待办全部完成时显示庆祝卡片
              </span>
            </span>
            <input
              type="checkbox"
              checked={showAllDoneCelebration}
              onChange={(event) =>
                onUpdateSettings({ showAllDoneCelebration: event.target.checked })
              }
              className="h-4 w-4 flex-shrink-0 accent-[var(--accent)]"
            />
          </label>
        </div>
      </section>
    </div>
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
