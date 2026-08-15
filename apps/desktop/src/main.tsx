/**
 * @file 应用入口
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { StickerWindow } from './components/sticker/StickerWindow';
import './styles/globals.css';
import logoMarkUrl from '../assets/celery-todo-no-text-light.svg';

// Vite 会将新版 Logo 指纹化并随应用打包；运行时同步覆盖静态占位 favicon。
const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
if (favicon) favicon.href = logoMarkUrl;

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

// 贴图窗口（简洁模式）与主窗口共用一个 bundle：Tauri 侧以 URL 查询参数区分
// （?sticker=<id>&project=<id>，由 Rust stickers.rs 建窗时注入）。
const query = new URLSearchParams(window.location.search);
const stickerId = query.get('sticker');
if (stickerId) document.documentElement.classList.add('sticker-page');
createRoot(root).render(
  <StrictMode>
    {stickerId ? (
      <StickerWindow stickerId={stickerId} initialProjectId={query.get('project') ?? ''} />
    ) : (
      <App />
    )}
  </StrictMode>,
);
