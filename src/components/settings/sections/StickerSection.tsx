/**
 * @file StickerSection - 设置页「贴图」子页面
 * @description 简洁模式浮窗（贴图）的样式设置：
 *              1. 4 个预设风格（玻璃 / 纯净 / 卡片 / 便利贴）—— 点选后一次性写入整套参数
 *              2. 「高级设置」可展开 4 个细粒度滑杆/开关，任一改动即切到 custom 预设
 *              3. 右侧实时预览，复用 globals.css 中 .sticker-shell 的视觉规则（由 CSS 变量驱动）
 */

import { useState, useCallback } from 'react';
import type { StickerPreset } from '../../../types';
import { STICKER_PRESET_VALUES } from '../../../types';

interface StickerSectionProps {
  preset: StickerPreset;
  radius: number;
  blur: number;
  opacity: number;
  shadow: boolean;
  onUpdateSettings: (updates: {
    stickerPreset?: StickerPreset;
    stickerRadius?: number;
    stickerBlur?: number;
    stickerOpacity?: number;
    stickerShadow?: boolean;
  }) => void;
}

type PresetId = Exclude<StickerPreset, 'custom'>;
const PRESETS: { id: PresetId; label: string; desc: string }[] = [
  { id: 'glass', label: '玻璃', desc: '半透明 · 高斯模糊' },
  { id: 'pure', label: '纯净', desc: '近实色 · 无模糊' },
  { id: 'card', label: '卡片', desc: '实色 · 外阴影' },
  { id: 'note', label: '便利贴', desc: '纸质 · 微旋转' },
];

export function StickerSection({
  preset,
  radius,
  blur,
  opacity,
  shadow,
  onUpdateSettings,
}: StickerSectionProps) {
  const [advancedOpen, setAdvancedOpen] = useState(preset === 'custom');

  // 选中某个预设 → 一次性写入该预设的整套视觉参数
  const applyPreset = useCallback(
    (id: PresetId) => {
      const values = STICKER_PRESET_VALUES[id];
      onUpdateSettings({
        stickerPreset: id,
        stickerRadius: values.radius,
        stickerBlur: values.blur,
        stickerOpacity: values.opacity,
        stickerShadow: values.shadow,
      });
    },
    [onUpdateSettings],
  );

  // 高级控件任一改动即自动切到 custom 预设
  const updateCustom = useCallback(
    (patch: {
      stickerRadius?: number;
      stickerBlur?: number;
      stickerOpacity?: number;
      stickerShadow?: boolean;
    }) => {
      onUpdateSettings({ stickerPreset: 'custom', ...patch });
    },
    [onUpdateSettings],
  );

  return (
    <section>
      <h3 className="claude-eyebrow mb-3" style={{ color: 'var(--text-secondary)' }}>
        贴图样式
      </h3>

      <p className="mb-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        选择简洁模式浮窗的外观。已打开的贴图会实时跟随变化。
      </p>

      <div className="grid grid-cols-2 gap-3">
        {PRESETS.map((item) => {
          const isActive = preset === item.id;
          const values = STICKER_PRESET_VALUES[item.id];
          return (
            <button
              key={item.id}
              onClick={() => applyPreset(item.id)}
              className="flex flex-col gap-2 p-2.5 rounded-lg border transition-all text-left"
              style={{
                borderColor: isActive ? 'var(--accent)' : 'var(--border-color)',
                backgroundColor: isActive ? 'var(--accent-subtle)' : 'transparent',
              }}
            >
              <StickerPreview
                preset={item.id}
                radius={values.radius}
                blur={values.blur}
                opacity={values.opacity}
                shadow={values.shadow}
              />
              <div className="flex flex-col px-0.5">
                <span
                  className="text-sm font-medium"
                  style={{ color: isActive ? 'var(--accent)' : 'var(--text-primary)' }}
                >
                  {item.label}
                </span>
                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  {item.desc}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 当前预设为自定义时显示标记卡片，避免选中态消失 */}
      {preset === 'custom' && (
        <div
          className="mt-3 flex items-center gap-2 px-3 py-2 rounded-md text-xs"
          style={{
            backgroundColor: 'var(--accent-subtle)',
            border: '1px solid var(--accent)',
            color: 'var(--accent-pressed)',
          }}
        >
          自定义 · 你已手动调整参数，不再绑定任一预设。
        </div>
      )}

      {/* 高级设置（可折叠） */}
      <button
        onClick={() => setAdvancedOpen((v) => !v)}
        className="mt-5 flex items-center gap-1 text-xs transition-colors hover:underline"
        style={{ color: 'var(--text-secondary)' }}
      >
        <span>{advancedOpen ? '▾' : '▸'}</span>
        高级设置
      </button>

      {advancedOpen && (
        <div className="mt-3 space-y-4">
          <SliderRow
            label="圆角大小"
            value={radius}
            min={0}
            max={32}
            step={1}
            unit="px"
            onChange={(v) => updateCustom({ stickerRadius: v })}
          />
          <SliderRow
            label="背景模糊"
            value={blur}
            min={0}
            max={50}
            step={1}
            unit="px"
            onChange={(v) => updateCustom({ stickerBlur: v })}
          />
          <SliderRow
            label="不透明度"
            value={opacity}
            min={30}
            max={100}
            step={1}
            unit="%"
            onChange={(v) => updateCustom({ stickerOpacity: v })}
          />
          <label className="flex items-center justify-between py-1 cursor-pointer">
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
              显示外阴影
            </span>
            <input
              type="checkbox"
              checked={shadow}
              onChange={(e) => updateCustom({ stickerShadow: e.target.checked })}
              className="w-4 h-4 accent-[var(--accent)]"
            />
          </label>

          {/* 大号实时预览：反映当前所有参数（含 custom）的真实效果 */}
          <div className="pt-2">
            <p className="mb-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              实时预览
            </p>
            <div className="flex justify-center">
              <StickerPreview
                preset={preset}
                radius={radius}
                blur={blur}
                opacity={opacity}
                shadow={shadow}
                large
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ============================================
// 子组件
// ============================================

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}

function SliderRow({ label, value, min, max, step, unit, onChange }: SliderRowProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
          {label}
        </span>
        <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
    </div>
  );
}

interface StickerPreviewProps {
  preset: StickerPreset;
  radius: number;
  blur: number;
  opacity: number;
  shadow: boolean;
  large?: boolean;
}

/**
 * 贴图缩略预览。复用 globals.css 里 .sticker-shell 的整套视觉规则，
 * 通过 data-sticker-preset + CSS 变量驱动，确保与真实贴图窗口一致。
 */
function StickerPreview({ preset, radius, blur, opacity, shadow, large }: StickerPreviewProps) {
  return (
    <div
      className={`sticker-shell sticker-preview${shadow ? ' sticker-shadow-on' : ''}`}
      data-sticker-preset={preset}
      style={
        {
          width: large ? 240 : 120,
          height: large ? 150 : 72,
          '--sticker-radius': `${radius}px`,
          '--sticker-blur': `${blur}px`,
          '--sticker-opacity': `${opacity / 100}`,
        } as React.CSSProperties
      }
    >
      <div
        className="flex h-full flex-col gap-1.5"
        style={{ padding: large ? 12 : 8, overflow: 'hidden' }}
      >
        <div
          className="flex items-center gap-1.5"
          style={{ fontSize: large ? 11 : 9, color: 'var(--text-secondary)' }}
        >
          <span
            style={{
              width: large ? 6 : 4,
              height: large ? 6 : 4,
              borderRadius: '50%',
              backgroundColor: 'var(--accent)',
              display: 'inline-block',
              flex: 'none',
            }}
          />
          待完成 3 项
        </div>
        <div className="flex items-center gap-1.5" style={{ fontSize: large ? 12 : 10 }}>
          <span
            style={{
              width: large ? 10 : 7,
              height: large ? 10 : 7,
              border: `1.2px solid var(--accent)`,
              borderRadius: '50%',
              flex: 'none',
            }}
          />
          <span style={{ color: 'var(--text-primary)' }}>完成需求文档</span>
        </div>
        <div className="flex items-center gap-1.5" style={{ fontSize: large ? 12 : 10 }}>
          <span
            style={{
              width: large ? 10 : 7,
              height: large ? 10 : 7,
              border: `1.2px solid var(--accent)`,
              borderRadius: '50%',
              flex: 'none',
            }}
          />
          <span style={{ color: 'var(--text-primary)' }}>与设计师对齐</span>
        </div>
      </div>
    </div>
  );
}
