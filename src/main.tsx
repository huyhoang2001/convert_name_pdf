import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui';
import './style.css';
import './styles/print.css';
import { desktopApi, listenForFolderDrops } from './desktop/api';
import { invoke } from '@tauri-apps/api/core';

window.pdfApp = desktopApi;
void listenForFolderDrops();
createRoot(document.getElementById('root')!).render(<App/>);
requestAnimationFrame(() => {
  void invoke('mark_update_started').catch(() => {});
  requestAnimationFrame(() => {
    void invoke<{ component: string; version: string | null; success: boolean } | null>('mark_runtime_ready').then(notice => {
      if (!notice) return;
      localStorage.setItem('b6h-update-completed', JSON.stringify(notice));
      window.dispatchEvent(new Event('b6h-update-ready'));
    }).catch(() => {});
  });
});
