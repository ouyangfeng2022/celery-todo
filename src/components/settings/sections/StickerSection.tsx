/**
 * @file StickerSection - 设置页「贴图」子页面
 * @description 简洁模式浮窗（贴图）的样式设置：
 *              4 个预设风格（玻璃 / 纯净 / 卡片 / 便利贴），点选后一次性写入整套参数。
 */

import { useCallback } from 'react';
import type { StickerPreset } from '../../../types';
import { STICKER_PRESET_VALUES } from '../../../types';

interface StickerSectionProps {
  preset: StickerPreset;
  onUpdateSettings: (updates: {
    stickerPreset?: StickerPreset;
    stickerRadius?: number;
    stickerBlur?: number;
    stickerOpacity?: number;
    stickerShadow?: boolean;
  }) => void;
}

const PRESETS: { id: StickerPreset; label: string; desc: string }[] = [
  { id: 'glass', label: '玻璃', desc: '半透明 · 高斯模糊' },
  { id: 'pure', label: '纯净', desc: '近实色 · 无模糊' },
  { id: 'card', label: '卡片', desc: '实色 · 外阴影' },
  { id: 'note', label: '便利贴', desc: '纸质 · 微旋转' },
];

export function StickerSection({ preset, onUpdateSettings }: StickerSectionProps) {
  // 选中某个预设 → 一次性写入该预设的整套视觉参数
  const applyPreset = useCallback(
    (id: StickerPreset) => {
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
    </section>
  );
}

// ============================================
// 子组件
// ============================================

interface StickerPreviewProps {
  preset: StickerPreset;
  radius: number;
  blur: number;
  opacity: number;
  shadow: boolean;
}

/**
 * 贴图缩略预览。复用 globals.css 里 .sticker-shell 的整套视觉规则，
 * 通过 data-sticker-preset + CSS 变量驱动，确保与真实贴图窗口一致。
 *
 * 性能注意：追加 sticker-preview-mini 类，禁用 backdrop-filter 与 ::before
 * 高光，避免 4 个预设按钮首次挂载时同时触发 GPU shader 编译造成卡顿。
 */
function StickerPreview({ preset, radius, blur, opacity, shadow }: StickerPreviewProps) {
  return (
    <div
      className={`sticker-shell sticker-preview sticker-preview-mini${shadow ? ' sticker-shadow-on' : ''}`}
      data-sticker-preset={preset}
      style={
        {
          width: 120,
          height: 72,
          '--sticker-radius': `${radius}px`,
          '--sticker-blur': `${blur}px`,
          '--sticker-opacity': `${opacity / 100}`,
        } as React.CSSProperties
      }
    >
      <div className="flex h-full flex-col gap-1.5" style={{ padding: 8, overflow: 'hidden' }}>
        <div
          className="flex items-center gap-1.5"
          style={{ fontSize: 9, color: 'var(--text-secondary)' }}
        >
          <span
            style={{
              width: 4,
              height: 4,
              borderRadius: '50%',
              backgroundColor: 'var(--accent)',
              display: 'inline-block',
              flex: 'none',
            }}
          />
          待完成 3 项
        </div>
        <div className="flex items-center gap-1.5" style={{ fontSize: 10 }}>
          <span
            style={{
              width: 7,
              height: 7,
              border: `1.2px solid var(--accent)`,
              borderRadius: '50%',
              flex: 'none',
            }}
          />
          <span style={{ color: 'var(--text-primary)' }}>完成需求文档</span>
        </div>
        <div className="flex items-center gap-1.5" style={{ fontSize: 10 }}>
          <span
            style={{
              width: 7,
              height: 7,
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
