import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';

const workbookFilter = [{ name: 'Excel workbook', extensions: ['xlsx'] }];
const folder = () => open({ directory: true, multiple: false });
const importWorkbook = async <T>(command: string, defaultPath?: string): Promise<T | null> => {
  if (defaultPath) return invoke<T>(command, { file: defaultPath });
  const file = await open({ multiple: false, filters: workbookFilter });
  return file ? invoke<T>(command, { file }) : null;
};
const newWorkbook = async <T>(command: string, sheets: unknown, name: string): Promise<T | null> => {
  const file = await save({ defaultPath: name, filters: workbookFilter });
  return file ? invoke<T>(command, { file, sheets }) : null;
};

export const desktopApi: Window['pdfApp'] & { getCalendarRebuildStatus: () => Promise<{ completed: number; total: number } | null>; cancelCalendarRebuild: () => Promise<void> } = {
  getCalendarData: () => invoke('get_calendar_data'),
  saveCalendarData: value => invoke('save_calendar_data', { value }),
  queryCalendarData: (startDate, endDate, boardView) => invoke('query_calendar_data', { startDate, endDate, boardView }),
  saveCalendarChanges: (value, expectedUpdatedAt, deletedIds) => invoke('save_calendar_changes', { value, expectedUpdatedAt, deletedIds }),
  getCalendarRebuildStatus: () => invoke('calendar_rebuild_status'),
  cancelCalendarRebuild: () => invoke('cancel_calendar_rebuild'),
  pickFolder: folder,
  pickDestination: async () => folder(),
  getDestinations: () => invoke('get_destinations'),
  saveDestination: (kind, value) => invoke('save_destination', { kind, value }),
  scan: root => invoke('scan', { root }),
  preview: input => invoke('preview', { input }),
  run: input => invoke('run_pdf', { input }),
  openPath: value => invoke('open_path', { value }),
  readReport: value => invoke('read_report', { value }),
  countScan: root => invoke('count_scan', { root }),
  getExistingCountReport: root => invoke('get_existing_count_report', { root }),
  saveCountReport: (root, language) => invoke('save_count_report', { root, language }),
  getLanguage: () => invoke('get_language'),
  saveLanguage: language => invoke('save_language', { language }),
  getTheme: () => invoke('get_theme'),
  saveTheme: theme => invoke('save_theme', { theme }),
  getSignatureSettings: () => invoke('get_signature_settings'),
  saveSignatureSettings: labels => invoke('save_signature_settings', { labels }),
  getSelectorSettings: selector => invoke('get_selector_settings', { selector }),
  saveSelectorSettings: (selector, labels) => invoke('save_selector_settings', { selector, labels }),
  getTranslations: () => invoke('get_translations'),
  saveTranslations: sheets => invoke('save_translations', { sheets }),
  clearTranslationCache: () => invoke('clear_translation_cache'),
  parseTranslationRows: rows => invoke('parse_translation_rows', { rows }),
  importTranslationWorkbook: (folder?: string) => importWorkbook('import_translation_workbook', folder),
  refreshTranslationWorkbook: file => invoke('refresh_translation_workbook', { file }),
  saveTranslationWorkbook: input => invoke('save_translation_workbook', { input }),
  newTranslationWorkbook: sheets => newWorkbook('new_translation_workbook', sheets, 'dich-thuat.xlsx'),
  importSignatureWorkbook: (folder?: string) => importWorkbook('import_signature_workbook', folder),
  refreshSignatureWorkbook: file => invoke('refresh_signature_workbook', { file }),
  saveSignatureWorkbook: input => invoke('save_signature_workbook', { input }),
  newSignatureWorkbook: sheets => newWorkbook('new_signature_workbook', sheets, 'so-chung-thuc-chu-ky.xlsx'),
  clearSignatureCache: () => invoke('clear_signature_cache'),
  importCopiesWorkbook: (folder?: string) => importWorkbook('import_copies_workbook', folder),
  refreshCopiesWorkbook: file => invoke('refresh_copies_workbook', { file }),
  saveCopiesWorkbook: input => invoke('save_copies_workbook', { input }),
  newCopiesWorkbook: sheets => newWorkbook('new_copies_workbook', sheets, 'copies.xlsx'),
  exportCopiesWorkbook: async sheets => {
    const file = await save({ defaultPath: 'copies.xlsx', filters: workbookFilter });
    return file ? invoke('export_copies_workbook', { file, sheets }) : null;
  },
  clearCopiesCache: () => invoke('clear_copies_cache'),
  checkForUpdates: () => invoke('check_for_updates'),
  onUpdateStatus: callback => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void listen('update-status', event => callback(event.payload as Parameters<typeof callback>[0])).then(unlisten => { if (disposed) unlisten(); else cleanup = unlisten; });
    return () => { disposed = true; cleanup?.(); };
  },
  getChatOnlineStatus: () => invoke('get_chat_online_status'),
  getChatKeyStatus: () => invoke('get_chat_key_status'),
  saveChatKey: value => invoke('save_chat_key', { value }),
  removeChatKey: () => invoke('remove_chat_key'),
  loadChatSession: () => invoke('load_chat_session'),
  saveChatSession: session => invoke('save_chat_session', { session }),
  resetChatSession: () => invoke('reset_chat_session'),
  askOnlineChat: async (messages, language, onProgress, context, requestId) => {
    const id = requestId ?? crypto.randomUUID();
    const unlisten = await listen<{ id: string; text: string }>('chat-online-progress', event => { if (event.payload.id === id) onProgress(event.payload.text); });
    try { return await invoke('ask_online_chat', { messages, language, id, context }); }
    finally { unlisten(); }
  },
  cancelOnlineChat: id => invoke('cancel_online_chat', { id }),
};

export async function listenForFolderDrops() {
  return getCurrentWindow().onDragDropEvent(event => {
    const type = event.payload.type;
    window.dispatchEvent(new CustomEvent('b6h-folder-drag', {
      detail: { type, ...('position' in event.payload ? { position: event.payload.position } : {}) },
    }));
    if (type === 'drop') window.dispatchEvent(new CustomEvent('b6h-folder-drop', {
      detail: { paths: event.payload.paths, position: event.payload.position },
    }));
  });
}
