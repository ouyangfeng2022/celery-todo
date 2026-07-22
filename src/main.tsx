/**
 * @file 应用入口
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { StickerWindow } from './components/sticker/StickerWindow';
import './styles/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

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
