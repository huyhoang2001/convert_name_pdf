import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui';
import './style.css';
import { desktopApi, listenForFolderDrops } from './desktop/api';
import { invoke } from '@tauri-apps/api/core';

window.pdfApp = desktopApi;
void listenForFolderDrops();
createRoot(document.getElementById('root')!).render(<App/>);
requestAnimationFrame(() => { void invoke('mark_update_started').catch(() => {}); });
