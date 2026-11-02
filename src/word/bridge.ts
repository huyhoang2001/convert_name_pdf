import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

export type WordSettings = { templatesDirectory: string; documentsDirectory: string; scanOnLaunch: boolean };
export type TemplateEntry = { id: string; name: string; path: string; size: number; modified: number; topic: string; kind: string; error: string | null };
export type RecentDocument = { path: string; name: string; size: number; modified: number; managed?: boolean; hash?: string; templateName?: string; day?: string; month?: string };
export type WordPayload = { file: string; name: string; bytesBase64: string; hash?: string; source: 'template' | 'managed' | 'external'; templateName?: string; day?: string; month?: string };
export type SaveWordInput = { bytesBase64: string; name: string; templateName: string; day: string; month: string; currentPath?: string; expectedHash?: string };
export type SaveWordResult = { path: string; hash: string; size: number; modified: number };
export type WordFont = { family: string; weight: number; style: 'normal' | 'italic'; bytesBase64: string };

export const wordBridge = {
  settings: () => invoke<WordSettings>('get_word_settings'),
  localFonts: () => invoke<WordFont[]>('get_word_local_fonts'),
  saveSettings: (value: WordSettings) => invoke<WordSettings>('save_word_settings', { value }),
  templates: () => invoke<TemplateEntry[]>('list_word_templates'),
  recent: () => invoke<RecentDocument[]>('get_recent_word_documents'),
  readTemplate: (file: string) => invoke<WordPayload>('read_word_template', { file }),
  importTemplate: (source: string, name: string, topic: string, kind: string, replaceExisting = false) => invoke<TemplateEntry>('import_word_template', { source, name, topic, kind, replaceExisting }),
  createTemplate: (bytesBase64: string, name: string, topic: string, kind: string) => invoke<TemplateEntry>('create_word_template', { bytesBase64, name, topic, kind }),
  pickDocuments: async () => {
    const selected = await open({ multiple: true, filters: [{ name: 'Word document', extensions: ['docx'] }] });
    const files = selected ? Array.isArray(selected) ? selected : [selected] : [];
    return Promise.all(files.map(file => invoke<WordPayload>('open_external_word_document', { file })));
  },
  openRecent: (file: string) => invoke<WordPayload>('open_recent_word_document', { file }),
  saveDocument: (input: SaveWordInput) => invoke<SaveWordResult>('save_word_document', { input }),
  pickFolder: () => open({ directory: true, multiple: false }),
  pickTemplateFile: () => open({ multiple: false, filters: [{ name: 'Word document', extensions: ['docx'] }] }),
};
