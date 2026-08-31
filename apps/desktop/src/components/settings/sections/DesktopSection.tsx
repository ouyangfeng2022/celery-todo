/**
 * @file DesktopSection - 设置页「桌面」子页面
 * @description 启动时打开 / 开机自启 / 最小化到托盘 / 自动检查更新 / 网络代理。
 *              从 SettingsPanel 拆出。仅在 window.electronAPI 存在时由父级路由渲染。
 */

import { useState } from 'react';

interface DesktopSectionProps {
  startupWindow: 'main' | 'sticker';
  autoStart: boolean;
  minimizeToTray: boolean;
  autoUpdateEnabled: boolean;
  proxyEnabled: boolean;
  proxyMode: 'system' | 'custom';
  proxyUrl: string;
  onUpdateSettings: (updates: {
    startupWindow?: 'main' | 'sticker';
    autoStart?: boolean;
    minimizeToTray?: boolean;
    autoUpdateEnabled?: boolean;
    proxyEnabled?: boolean;
    proxyMode?: 'system' | 'custom';
    proxyUrl?: string;
  }) => void;
}

/** 自定义代理地址校验：仅支持 http 代理（host:port 或 http://host:port）。
 *  与 Rust 侧 proxy.rs::normalize_custom_url 保持同一口径。 */
function isValidProxyUrl(url: string): boolean {
  return /^http:\/\/[a-zA-Z0-9._-]+:\d+$/.test(url) || /^[a-zA-Z0-9._-]+:\d+$/.test(url);
}

export function DesktopSection({
  startupWindow,
  autoStart,
  minimizeToTray,
  autoUpdateEnabled,
  proxyEnabled,
  proxyMode,
  proxyUrl,
  onUpdateSettings,
}: DesktopSectionProps) {
  // 自定义地址用本地草稿编辑，失焦/回车才提交 —— 避免逐键写库并触发宿主重设代理
  const [proxyUrlDraft, setProxyUrlDraft] = useState(proxyUrl);
  const [proxyError, setProxyError] = useState('');

  /** 自定义模式下当前草稿是否可用（开启/切换模式前的门禁） */
  const customUrlReady = isValidProxyUrl(proxyUrlDraft.trim());

  const commitProxyUrl = () => {
    const raw = proxyUrlDraft.trim();
    if (raw === '') {
      if (proxyEnabled && proxyMode === 'custom') {
        setProxyError('请输入代理地址（如 127.0.0.1:7890）');
        return;
      }
      setProxyError('');
      if (raw !== proxyUrl) onUpdateSettings({ proxyUrl: raw });
      return;
    }
    if (!isValidProxyUrl(raw)) {
      setProxyError('代理地址无效：仅支持 http 代理，如 127.0.0.1:7890');
      return;
    }
    setProxyError('');
    if (raw !== proxyUrl) onUpdateSettings({ proxyUrl: raw });
  };

  const switchProxyMode = (mode: 'system' | 'custom') => {
    if (mode === 'custom' && proxyEnabled && !customUrlReady) {
      setProxyError('切换前请先填写有效的代理地址');
      return;
    }
    setProxyError('');
    onUpdateSettings({ proxyMode: mode });
  };

  const toggleProxy = (enabled: boolean) => {
    if (enabled && proxyMode === 'custom' && !customUrlReady) {
      setProxyError('开启前请先填写有效的代理地址');
      return;
    }
    setProxyError('');
    onUpdateSettings({ proxyEnabled: enabled });
  };

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

      <section>
        <h3 className="claude-eyebrow mb-1" style={{ color: 'var(--text-secondary)' }}>
          网络代理
        </h3>
        <p className="text-xs leading-relaxed mb-2" style={{ color: 'var(--text-tertiary)' }}>
          用于应用内检查与下载更新。网络无法直连 GitHub 时开启（改后即时生效，无需重启）。
        </p>
        <label className="flex items-center justify-between py-2 cursor-pointer">
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
            启用代理
          </span>
          <input
            type="checkbox"
            checked={proxyEnabled}
            onChange={(e) => toggleProxy(e.target.checked)}
            className="w-4 h-4 accent-[var(--accent)]"
          />
        </label>
        {proxyEnabled && (
          <>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                代理模式
              </span>
              <select
                value={proxyMode}
                onChange={(e) => switchProxyMode(e.target.value as 'system' | 'custom')}
                className="rounded-md border-none px-2.5 py-1.5 text-[13px] cursor-pointer transition-colors"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                }}
              >
                <option value="system">系统代理</option>
                <option value="custom">自定义地址</option>
              </select>
            </div>
            {proxyMode === 'custom' && (
              <div className="py-2">
                <span className="block text-sm mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  代理地址
                </span>
                <input
                  type="text"
                  value={proxyUrlDraft}
                  onChange={(e) => setProxyUrlDraft(e.target.value)}
                  onBlur={commitProxyUrl}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  placeholder="http://127.0.0.1:7890"
                  spellCheck={false}
                  className="w-full rounded-md border-none px-2.5 py-1.5 text-[13px] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                  }}
                />
                {proxyError && (
                  <p className="mt-1.5 text-xs" style={{ color: 'var(--danger)' }}>
                    {proxyError}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
