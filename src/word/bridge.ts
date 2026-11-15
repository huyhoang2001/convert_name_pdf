import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';

export type WordSettings = { templatesDirectory: string; documentsDirectory: string; scanOnLaunch: boolean; showDocxCompatibilityWarnings: boolean };
export type TemplateEntry = { id: string; name: string; path: string; size: number; modified: number; topic: string; kind: string; error: string | null; pinned: boolean };
export type RecentDocument = { path: string; name: string; size: number; modified: number; managed?: boolean; hash?: string; templateName?: string; day?: string; month?: string; pinned?: boolean };
export type WordPayload = { file: string; name: string; bytesBase64: string; hash?: string; source: 'template' | 'managed' | 'external'; templateName?: string; day?: string; month?: string };
export type SaveWordInput = { bytesBase64: string; name: string; templateName: string; day: string; month: string; currentPath?: string; expectedHash?: string; targetPath?: string };
export type SaveWordResult = { path: string; hash: string; size: number; modified: number };
export type WordFont = { family: string; weight: number; style: 'normal' | 'italic'; bytesBase64: string };
export type WordDraft = { id: string; name: string; bytesBase64: string; path?: string; sourceFile?: string; hash?: string; source: 'template' | 'managed' | 'external' | 'blank'; templateName: string; day: string; month: string; dirty: boolean; revision: number; order: number; active: boolean; split: boolean; externalChanged?: boolean };
export type WordPrinter = { name: string; label: string; default: boolean; duplex: boolean | null; longEdge: boolean | null; shortEdge: boolean | null };
export type WordRefeedPreference = { face: 'faceUp' | 'faceDown'; leadingEdge: 'top' | 'bottom' };

export const wordBridge = {
  openDevtools: () => invoke<void>('open_word_devtools'),
  settings: () => invoke<WordSettings>('get_word_settings'),
  localFonts: () => invoke<WordFont[]>('get_word_local_fonts'),
  printers: () => invoke<WordPrinter[]>('get_word_printers'),
  openPrinterProperties: (printer: string) => invoke<void>('open_word_printer_properties', { printer }),
  printPdf: (pdfBase64: string, printer: string, mode: string, copies: number, collate: boolean) => invoke<string>('print_word_pdf', { pdfBase64, printer, mode, copies, collate }),
  printManualPass: (pdfBase64: string, printer: string, pass: 'front' | 'back') => invoke<string>('print_word_manual_pass', { pdfBase64, printer, pass }),
  refeedPreferences: () => invoke<Record<string, WordRefeedPreference>>('get_word_refeed_preferences'),
  saveRefeedPreference: (printer: string, face: WordRefeedPreference['face'], leadingEdge: WordRefeedPreference['leadingEdge']) => invoke<Record<string, WordRefeedPreference>>('save_word_refeed_preference', { printer, face, leadingEdge }),
  saveSettings: (value: WordSettings) => invoke<WordSettings>('save_word_settings', { value }),
  templates: () => invoke<TemplateEntry[]>('list_word_templates'),
  pinTemplate: (file: string, pinned: boolean) => invoke<void>('set_word_template_pinned', { file, pinned }),
  openRecentLocation: (file: string) => invoke<void>('open_recent_word_location', { file }),
  recent: () => invoke<RecentDocument[]>('get_recent_word_documents'),
  updateRecent: (file: string, action: 'pin' | 'unpin' | 'remove' | 'delete' | 'rename', name?: string) => invoke<void>('update_recent_word_document', { file, action, name }),
  readTemplate: (file: string) => invoke<WordPayload>('read_word_template', { file }),
  importTemplate: (source: string, name: string, topic: string, kind: string, replaceExisting = false) => invoke<TemplateEntry>('import_word_template', { source, name, topic, kind, replaceExisting }),
  createTemplate: (bytesBase64: string, name: string, topic: string, kind: string) => invoke<TemplateEntry>('create_word_template', { bytesBase64, name, topic, kind }),
  pickDocuments: async () => {
    const selected = await open({ multiple: true, filters: [{ name: 'Word document', extensions: ['docx'] }] });
    const files = selected ? Array.isArray(selected) ? selected : [selected] : [];
    return files;
  },
  openExternal: (file: string) => invoke<WordPayload>('open_external_word_document', { file }),
  openRecent: (file: string) => invoke<WordPayload>('open_recent_word_document', { file }),
  saveDocument: (input: SaveWordInput) => invoke<SaveWordResult>('save_word_document', { input }),
  saveDraft: (input: WordDraft) => invoke<void>('save_word_draft', { input }),
  listDrafts: () => invoke<WordDraft[]>('list_word_drafts'),
  removeDraft: (id: string) => invoke<void>('remove_word_draft', { id }),
  pickSavePath: async (directory: string, fileName: string, title: string) => {
    const path = await save({ title, defaultPath: `${directory.replace(/[\\/]+$/, '')}\\${fileName}`, filters: [{ name: 'Word document', extensions: ['docx'] }] });
    return path && !/\.docx$/i.test(path) ? `${path}.docx` : path;
  },
  pickFolder: () => open({ directory: true, multiple: false }),
  pickTemplateFile: () => open({ multiple: false, filters: [{ name: 'Word document', extensions: ['docx'] }] }),
};
