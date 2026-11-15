import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { autoUpdate, flip, FloatingFocusManager, offset, shift, useClick, useDismiss, useFloating, useInteractions, useListNavigation, useRole } from '@floating-ui/react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { decodeDocx, encodeDocx } from './docxCodec';
import type { Tab, EditorAccess } from './editorTypes';
const WordcraftEditor = lazy(() => import('./WordcraftEditor').then(({ WordcraftEditor }) => ({ default: WordcraftEditor })));
const DocxEditor = lazy(() => import('@docx-editor.dev/react').then(({ DocxEditor }) => ({ default: DocxEditor })));
import type { FontConfigurationFragment } from '@docx-editor.dev/core/editor';
import { wordBridge, type TemplateEntry, type RecentDocument, type WordPayload, type WordSettings, type WordDraft } from './bridge';
import { displayWordPath } from './paths';
import { filterTemplates } from './templateFilter';
import { filterRecentDocuments } from './recentFilter';
import { adjacentTabId } from './tabNavigation';
import en from '../locales/en.json';

type T = (key: keyof typeof en) => string;
type Pending = { id: string; window: boolean };
type RecentAction = 'remove' | 'delete' | 'rename' | 'quick' | 'location';
const today = () => { const date = new Date(); return { day: String(date.getDate()).padStart(2, '0'), month: String(date.getMonth()+1).padStart(2, '0') }; };
const issue = (error: unknown) => String(error instanceof Error ? error.message : error);
const cleanName = (name: string) => name.replace(/\.docx$/i, '').trim();
const MAX_OPEN_WORD_FILES = 20;
const sameWordFile = (a: string | undefined, b: string) => !!a && a.replaceAll('\\', '/').toLowerCase() === b.replaceAll('\\', '/').toLowerCase();
const recentDate = (modified: number, language: 'EN' | 'VI') => new Date(modified < 100_000_000_000 ? modified * 1000 : modified).toLocaleDateString(language === 'VI' ? 'vi-VN' : 'en-US');

function RecentFileMenu({ open, onOpenChange, onAction, t }: { open: boolean; onOpenChange: (open: boolean) => void; onAction: (action: RecentAction) => void; t: T }) {
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const changeOpen = (value: boolean) => { onOpenChange(value); if (value) setActiveIndex(0); };
  const { refs, floatingStyles, context } = useFloating({ open, onOpenChange: changeOpen, placement: 'bottom-end', middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })], whileElementsMounted: autoUpdate });
  const items: { action: RecentAction; label: keyof typeof en }[] = [
    { action: 'quick', label: 'wordQuickEdit' }, { action: 'remove', label: 'wordRemoveRecent' },
    { action: 'rename', label: 'wordRename' }, { action: 'delete', label: 'wordDelete' }, { action: 'location', label: 'wordOpenLocation' },
  ];
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    useClick(context), useDismiss(context), useRole(context, { role: 'menu' }),
    useListNavigation(context, { listRef: itemsRef, activeIndex, onNavigate: setActiveIndex, loop: true }),
  ]);
  return <div className="word-recent-menu">
    <button ref={refs.setReference} {...getReferenceProps({ type: 'button', 'aria-label': t('wordRecentOptions'), 'aria-haspopup': 'menu', 'aria-expanded': open, onClick: () => setActiveIndex(0) })}>⋮</button>
    {open && <FloatingFocusManager context={context} modal={false}><div ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()}>
      {items.map(({ action, label }, index) => <button key={action} ref={node => { itemsRef.current[index] = node; }} {...getItemProps({ type: 'button', role: 'menuitem', tabIndex: activeIndex === index ? 0 : -1, onClick: () => onAction(action) })}>{t(label)}</button>)}
    </div></FloatingFocusManager>}
  </div>;
}

export function WordSettingsPanel({ t }: { t: T }) {
  const [settings, setSettings] = useState<WordSettings | null>(null);
  const [status, setStatus] = useState('');
  useEffect(() => { void wordBridge.settings().then(setSettings).catch(error => setStatus(issue(error))); }, []);
  if (!settings) return <p role="status">{status || t('wordLoading')}</p>;
  const choose = async (key: 'templatesDirectory' | 'documentsDirectory') => {
    const path = await wordBridge.pickFolder();
    if (typeof path === 'string') setSettings(value => value && { ...value, [key]: path });
  };
  return <section className="panel word-settings"><h2>{t('wordFolders')}</h2>
    {(['templatesDirectory','documentsDirectory'] as const).map(key => <label key={key}>{t(key)}<span><input value={displayWordPath(settings[key])} onChange={event => setSettings({ ...settings, [key]: event.target.value })}/><button type="button" onClick={() => void choose(key)}>{t('wordBrowse')}</button></span></label>)}
    <label className="word-check"><input type="checkbox" checked={settings.scanOnLaunch} onChange={event => setSettings({ ...settings, scanOnLaunch: event.target.checked })}/>{t('scanOnLaunch')}</label>
    <label className="word-check"><input type="checkbox" checked={settings.showDocxCompatibilityWarnings} onChange={event => setSettings({ ...settings, showDocxCompatibilityWarnings: event.target.checked })}/>{t('wordShowDocxCompatibilityWarnings')}</label>
    <button className="primary-button" type="button" onClick={() => void wordBridge.saveSettings(settings).then(value => {setSettings(value);setStatus(t('wordSaved'));}).catch(error => setStatus(issue(error)))}>{t('settingsSave')}</button><output role="status">{status}</output>
  </section>;
}

export default function WordWorkspace({ visible, entry, language, t }: { visible: boolean; entry: number; language: 'EN'|'VI'; theme?: 'light'|'dark'; t: T }) {
  const [templates, setTemplates] = useState<TemplateEntry[]>([]), [recent, setRecent] = useState<RecentDocument[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]), [active, setActive] = useState(''), [split, setSplit] = useState(''), [detail, setDetail] = useState<TemplateEntry | null>(null);
  const [showTemplates, setShowTemplates] = useState(true);
  const [backstageByTab, setBackstageByTab] = useState<Record<string, boolean>>({});
  const showEditorChrome = backstageByTab[active] === false && (!split || backstageByTab[split] === false);
  useLayoutEffect(() => { if (visible) setShowTemplates(true); }, [visible, entry]);
  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null);
  const [fonts, setFonts] = useState<FontConfigurationFragment | null>(null);
  const [recentTab, setRecentTab] = useState<'recent' | 'favorites'>('recent');
  const [templateSearch, setTemplateSearch] = useState(''), [templateTab, setTemplateTab] = useState<'templates' | 'favorites'>('templates'), [templateView, setTemplateView] = useState<'large' | 'details'>('large'), [recentFilter, setRecentFilter] = useState<'all' | 'managed' | 'other'>('all'), [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null), [conflict, setConflict] = useState<{ source: string; name: string } | null>(null);
  const [showCompatibilityWarnings, setShowCompatibilityWarnings] = useState(true), [compatibilityWarning, setCompatibilityWarning] = useState<{ tabId: string; message: string } | null>(null);
  const [recentMenu, setRecentMenu] = useState('');
  const [startedIds, setStartedIds] = useState<Set<string>>(() => new Set());
  const [warmFailed, setWarmFailed] = useState(false);
  const warmId = useRef('');
  useEffect(() => { setStartedIds(ids => {
    if ((!active || ids.has(active)) && (!split || ids.has(split))) return ids;
    return new Set([...ids, active, split].filter(Boolean));
  }); }, [active, split]);
  const recentTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => { const buttons = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]') || []); const current = buttons.indexOf(event.currentTarget); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : event.key === 'ArrowRight' ? (current + 1) % buttons.length : event.key === 'ArrowLeft' ? (current + buttons.length - 1) % buttons.length : -1; if (next >= 0) { event.preventDefault(); buttons[next]?.focus(); setRecentTab(next === 0 ? 'recent' : 'favorites'); } };
  const tabsRef = useRef(tabs), closeAllowed = useRef(false), closeAllRef = useRef(false), lastActiveRef = useRef(''), saveRef = useRef<(id: string, as?: boolean) => Promise<boolean>>(async () => false);
  const activeRef = useRef(active), splitRef = useRef(split);
  const tabStripRef = useRef<HTMLDivElement>(null);
  useEffect(() => { tabStripRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [active, showEditorChrome]);
  const createRef = useRef<() => void>(() => {});
  const activateRef = useRef<(id: string) => void>(() => {});
  const editors = useRef(new Map<string, EditorAccess>());
  const draftWrites = useRef(new Map<string, Promise<void>>());
  const snapshotCache = useRef(new Map<string, { revision: number; bytesBase64: string; signature: string }>());
  const closingAll = useRef(false);
  const fontsPromise = useRef<Promise<FontConfigurationFragment> | null>(null);
  const ensureFonts = () => {
    if (!fontsPromise.current) fontsPromise.current = wordBridge.localFonts().then(async faces => { const { fontConfiguration } = await import('./docx'); const value = fontConfiguration(faces); setFonts(value); return value; });
    return fontsPromise.current;
  };
  tabsRef.current = tabs;
  activeRef.current = active; splitRef.current = split;
  const refresh = async () => { try { const [items, rows] = await Promise.all([wordBridge.templates(), wordBridge.recent()]); setTemplates(items); setRecent(rows); setStatus(''); } catch (error) { setStatus(issue(error)); } };
  useEffect(() => { void wordBridge.settings().then(settings => { if (settings.scanOnLaunch) void refresh(); }); }, []);
  useEffect(() => { void wordBridge.settings().then(settings => setShowCompatibilityWarnings(settings.showDocxCompatibilityWarnings)).catch(error => setStatus(issue(error))); }, []);
  useEffect(() => { if (visible) void refresh(); }, [visible, entry]);
  useEffect(() => { setPreviewBytes(null); if (!detail || detail.error) return; let live=true; void ensureFonts(); void wordBridge.readTemplate(detail.path).then(payload => { if (live) setPreviewBytes(decodeDocx(payload.bytesBase64)); }).catch(error => { if (live) setStatus(issue(error)); }); return () => { live=false; }; }, [detail]);
  useEffect(() => { let unlisten: (() => void) | undefined; void getCurrentWindow().onCloseRequested(event => { if (closeAllowed.current) return; const dirty = tabsRef.current.find(tab => tab.dirty); if (dirty) { event.preventDefault(); setPending({ id: dirty.id, window: true }); } }).then(fn => unlisten = fn); return () => unlisten?.(); }, []);
  useEffect(() => { if (!visible || showTemplates) return; const onKey = (event: KeyboardEvent) => { if (event.key === 'F12' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void wordBridge.openDevtools(); return; } if (event.key === 'F12' && active && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || (event.target instanceof HTMLElement && event.target.isContentEditable))) { event.preventDefault(); void saveRef.current(active, true); return; } if (event.ctrlKey && !event.shiftKey && !event.altKey && (event.key === 'PageDown' || event.key === 'PageUp')) { const next = adjacentTabId(tabsRef.current.map(tab => tab.id), activeRef.current, event.key === 'PageDown' ? 1 : -1); if (next) { event.preventDefault(); activateRef.current(next); } return; } if (!(event.ctrlKey || event.metaKey)) return; const key=event.key.toLowerCase(); if (key==='n') { event.preventDefault(); createRef.current(); } else if (key==='s' && active) { event.preventDefault(); void saveRef.current(active, event.shiftKey); } else if (key==='o') { event.preventDefault(); openDocument(); } else if (key==='p' && active) { event.preventDefault(); void editors.current.get(active)?.print(); } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [visible, active, showTemplates]);
  const update = (id: string, change: Partial<Tab>) => { tabsRef.current = tabsRef.current.map(row => row.id === id ? { ...row, ...change } : row); setTabs(tabsRef.current); };
  useEffect(() => { void wordBridge.listDrafts().then(drafts => {
    if (tabsRef.current.length || !drafts.length) return;
    drafts.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const restored: Tab[] = drafts.slice(0, MAX_OPEN_WORD_FILES).map(draft => ({ id: draft.id, name: draft.name, bytes: decodeDocx(draft.bytesBase64), path: draft.path, sourceFile: draft.sourceFile, hash: draft.hash, source: draft.source, templateName: draft.templateName, day: draft.day, month: draft.month, dirty: draft.dirty, saving: false, error: draft.externalChanged ? 'The original file changed outside B6H. Save As to keep this draft.' : '', readonlyReason: '', revision: draft.revision }));
    if (drafts.length > MAX_OPEN_WORD_FILES) setStatus(`Restored 20 files. ${drafts.length - MAX_OPEN_WORD_FILES} additional drafts remain available after you close files and restart.`);
    if (!warmFailed && restored.length && !warmId.current) warmId.current = restored[0].id;
    tabsRef.current = restored; setTabs(restored);
    const primary = drafts.slice(0, MAX_OPEN_WORD_FILES).find(draft => draft.active)?.id ?? restored[0]?.id;
    const beside = drafts.slice(0, MAX_OPEN_WORD_FILES).find(draft => draft.split && draft.id !== primary)?.id ?? '';
    if (primary) { setActive(primary); activeRef.current = primary; lastActiveRef.current = primary; }
    if (beside) { setSplit(beside); splitRef.current = beside; }
  }).catch(error => setStatus(issue(error))); }, []);
  const persistTab = async (tab: Tab) => {
    if (closingAll.current) return;
    const cached = snapshotCache.current.get(tab.id);
    const signature = JSON.stringify([tab.revision, tab.name, tab.dirty, tab.path, activeRef.current === tab.id, splitRef.current === tab.id, tabsRef.current.findIndex(row => row.id === tab.id)]);
    if (cached?.signature === signature) return;
    const bytesBase64 = cached?.revision === tab.revision ? cached.bytesBase64 : await editors.current.get(tab.id)?.save() ?? encodeDocx(tab.bytes);
    const current = tabsRef.current.find(row => row.id === tab.id);
    if (closingAll.current || !current || current.revision !== tab.revision) return;
    if (current.source !== 'blank') {
      const { checkDocxSave } = await import('./docx');
      const error = checkDocxSave(current.bytes, decodeDocx(bytesBase64));
      if (error) throw Error(error);
    }
    const draft: WordDraft = { id: current.id, name: current.name, bytesBase64, path: current.path, sourceFile: current.sourceFile, hash: current.hash, source: current.source, templateName: current.templateName, day: current.day, month: current.month, dirty: current.dirty, revision: current.revision, order: tabsRef.current.findIndex(row => row.id === current.id), active: activeRef.current === current.id, split: splitRef.current === current.id };
    const prior = draftWrites.current.get(tab.id) ?? Promise.resolve();
    const write = prior.catch(() => {}).then(() => wordBridge.saveDraft(draft));
    draftWrites.current.set(tab.id, write);
    try { await write; snapshotCache.current.set(tab.id, { revision: tab.revision, bytesBase64, signature }); } finally { if (draftWrites.current.get(tab.id) === write) draftWrites.current.delete(tab.id); }
  };
  useEffect(() => { const timer = window.setInterval(() => { for (const tab of tabsRef.current) void persistTab(tab).catch(error => setStatus(issue(error))); }, 15000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (!tabs.length) return; const timer = window.setTimeout(() => { for (const tab of tabsRef.current) if (snapshotCache.current.get(tab.id)?.revision !== tab.revision) void persistTab(tab).catch(error => setStatus(issue(error))); }, 2000); return () => window.clearTimeout(timer); }, [tabs]);
  const snapshots = useRef(new Set<string>());
  const openPayload = (payload: WordPayload, show = true) => {
    const prior = tabsRef.current.find(tab => sameWordFile(tab.sourceFile, payload.file));
    if (prior) { if (show) { setShowTemplates(false); if (prior.id === split) setSplit(active); setActive(prior.id); activeRef.current = prior.id; lastActiveRef.current = prior.id; if (prior.id === split) splitRef.current = active; setDetail(null); } return true; }
    if (closingAll.current || tabsRef.current.length >= MAX_OPEN_WORD_FILES) { setStatus('You can have up to 20 files open. Close a file before opening another.'); return false; }
    const date = today(); try { const tab: Tab = { id: crypto.randomUUID(), name: payload.name, bytes: decodeDocx(payload.bytesBase64), path: payload.source === 'managed' ? payload.file : undefined, sourceFile: payload.file, hash: payload.hash, source: payload.source, templateName: payload.templateName || payload.name, day: payload.day || date.day, month: payload.month || date.month, dirty: payload.source !== 'managed', saving: false, error: '', readonlyReason: '', revision: 0 }; if (!warmFailed && !warmId.current) warmId.current = tab.id; tabsRef.current = [...tabsRef.current, tab]; setTabs(tabsRef.current); if (show) { setShowTemplates(false); setActive(tab.id); activeRef.current = tab.id; lastActiveRef.current = tab.id; setSplit(''); splitRef.current = ''; setDetail(null); void ensureFonts().catch(error => { const message = issue(error); setStatus(message); update(tab.id, { readonlyReason: message }); }); } return true; } catch (error) { setStatus(issue(error)); return false; }
  };
  const openDocument = () => { void wordBridge.pickDocuments().then(async files => { let lastId = ''; for (const file of files) { if (closingAll.current) break; const prior = tabsRef.current.find(tab => sameWordFile(tab.sourceFile, file)); if (prior) { lastId = prior.id; continue; } if (tabsRef.current.length >= MAX_OPEN_WORD_FILES) { setStatus('You can have up to 20 files open. Close a file before opening another.'); break; } const payload = await wordBridge.openExternal(file); if (openPayload(payload, false)) lastId = tabsRef.current.find(tab => sameWordFile(tab.sourceFile, payload.file))?.id ?? ''; } if (lastId) activate(lastId); }).catch(error => setStatus(issue(error))); };
  const save = async (id: string, as = false, suppliedBytes?: string): Promise<boolean> => {
    const tab = tabsRef.current.find(row => row.id === id); if (!tab || tab.readonlyReason || tab.saving) return false;
    let name = tab.name, targetPath: string | null = null;
    if (as) { try { const settings = await wordBridge.settings(); const suggested = `${cleanName(tab.name) || t('wordUntitled')}.docx`; targetPath = await wordBridge.pickSavePath(settings.documentsDirectory, suggested, t('wordSaveAs')); } catch (error) { update(id, { error: issue(error) }); return false; } if (!targetPath) return false; name = cleanName(targetPath.split(/[\\/]/).pop() || ''); if (!name) return false; }
    else if (!tab.path) { const answer = window.prompt(t('wordNamePrompt'), tab.name); if (answer === null) return false; name = cleanName(answer); if (!name) return false; }
    update(id, { saving: true, error: '' });
    try { const access = editors.current.get(id); let bytes = decodeDocx(suppliedBytes ?? await access?.save() ?? encodeDocx(tab.bytes)); const snapshotRevision = access?.snapshotRevision?.() ?? ''; const { checkDocxSave, checkDocxOutput, preserveDocxSectionProperties } = await import('./docx'); if (tab.source !== 'blank') { const error = checkDocxSave(tab.bytes, bytes); if (error) throw Error(error); bytes = preserveDocxSectionProperties(tab.bytes, bytes); } const finalError = tab.source === 'blank' ? checkDocxOutput(bytes) : checkDocxSave(tab.bytes, bytes); if (finalError) throw Error(finalError); const bytesBase64 = encodeDocx(bytes); const result = await wordBridge.saveDocument({ bytesBase64, name, templateName: tab.templateName, day: tab.day, month: tab.month, currentPath: as ? undefined : tab.path, expectedHash: as ? undefined : tab.hash, targetPath: targetPath || undefined }); const changedDuringSave = tabsRef.current.find(row => row.id === id)?.revision !== tab.revision; if (!suppliedBytes) access?.confirmSaved?.(name, snapshotRevision); tabsRef.current = tabsRef.current.map(row => row.id === id ? { ...row, name, bytes, path: result.path, sourceFile: result.path, hash: result.hash, source: 'managed', saving: false, dirty: row.revision !== tab.revision } : row); setTabs(tabsRef.current); snapshotCache.current.delete(id); void refresh(); return suppliedBytes ? true : !changedDuringSave; }
    catch (error) { update(id, { saving: false, error: issue(error) }); return false; }
  };
  saveRef.current = save;
  const activate = (id: string) => { setShowTemplates(false); if (id === split) setSplit(active); setActive(id); activeRef.current = id; lastActiveRef.current = id; if (id === split) splitRef.current = active; void ensureFonts().catch(error => { const message = issue(error); setStatus(message); update(id, { readonlyReason: message }); }); };
  const openKnownFile = (file: string, read: (file: string) => Promise<WordPayload>) => { if (closingAll.current) return; const prior = tabsRef.current.find(tab => sameWordFile(tab.sourceFile, file)); if (prior) { activate(prior.id); return; } if (tabsRef.current.length >= MAX_OPEN_WORD_FILES) { setStatus('You can have up to 20 files open. Close a file before opening another.'); return; } void read(file).then(payload => openPayload(payload)).catch(error => setStatus(issue(error))); };
  activateRef.current = activate;
  const showBeside = (id: string) => { const nextSplit = split === id ? '' : id; setSplit(nextSplit); splitRef.current = nextSplit; void ensureFonts().catch(error => { const message = issue(error); setStatus(message); update(id, { readonlyReason: message }); }); };
  const removeTab = (id: string, keepDraft = false) => {
    snapshotCache.current.delete(id);
    setBackstageByTab(current => { const next = { ...current }; delete next[id]; return next; });
    setStartedIds(ids => { const next = new Set(ids); next.delete(id); return next; });
    const removal = keepDraft ? Promise.resolve() : (draftWrites.current.get(id) ?? Promise.resolve()).catch(() => {}).then(() => wordBridge.removeDraft(id)).catch(error => setStatus(issue(error)));
    const next = active === id ? split && split !== id ? split : tabsRef.current.find(row => row.id !== id)?.id || '' : active;
    tabsRef.current = tabsRef.current.filter(row => row.id !== id); setTabs(tabsRef.current);
    if (active === id) { setActive(next); activeRef.current = next; }
    if (lastActiveRef.current === id) lastActiveRef.current = next;
    if (split === id || split === next) setSplit('');
    return removal;
  };
  const close = (id: string) => { const tab = tabsRef.current.find(row => row.id === id); if (!tab) return; if (tab.dirty) { setPending({ id, window: false }); return; } removeTab(id); };
  const closeAllFiles = async (saveFirst: boolean) => {
    if (closingAll.current) return;
    closingAll.current = true;
    try {
      if (saveFirst) for (const tab of [...tabsRef.current]) if (tab.dirty && !await save(tab.id)) return;
      const closing = [...tabsRef.current];
      await Promise.all(closing.map(async tab => { await draftWrites.current.get(tab.id)?.catch(() => {}); await wordBridge.removeDraft(tab.id); snapshotCache.current.delete(tab.id); }));
      for (const tab of closing) void removeTab(tab.id, true);
      tabsRef.current = []; setTabs([]);
      setActive(''); activeRef.current = '';
      setPending(null);
      setSplit(''); splitRef.current = '';
      lastActiveRef.current = '';
    } catch (error) { setStatus(issue(error));
    } finally { closingAll.current = false; }
  };
  const finishClose = async (saveFirst: boolean) => { if (!pending) return; if (saveFirst && !await save(pending.id)) return; const wasWindow = pending.window; const id = pending.id; setPending(null); if (wasWindow) { if (!saveFirst) await removeTab(id); const next = tabsRef.current.find(row => row.id !== id && row.dirty); if (next) setPending({ id: next.id, window: true }); else { for (const tab of tabsRef.current) await persistTab(tab); closeAllowed.current = true; await getCurrentWindow().close(); } } else { await removeTab(id); if (closeAllRef.current) { const next = tabsRef.current.find(row => row.dirty); if (next) setPending({ id: next.id, window: false }); else { for (const tab of [...tabsRef.current]) await removeTab(tab.id); tabsRef.current = []; setTabs([]); setActive(''); activeRef.current = ''; setSplit(''); splitRef.current = ''; lastActiveRef.current = ''; closeAllRef.current = false; } } } };
  const keepDraftAndClose = async () => { if (!pending) return; try { for (const tab of tabsRef.current) await persistTab(tab); if (pending.window) { closeAllowed.current = true; await getCurrentWindow().close(); } else { removeTab(pending.id, true); setPending(null); } } catch (error) { update(pending.id, { error: issue(error) }); } };
  const create = async () => { if (closingAll.current || tabsRef.current.length >= MAX_OPEN_WORD_FILES) { setStatus('You can have up to 20 files open. Close a file before creating another.'); return; } setBusy(true); try { const { blankWordDocument } = await import('./docx'); if (closingAll.current || tabsRef.current.length >= MAX_OPEN_WORD_FILES) { setStatus('You can have up to 20 files open. Close a file before creating another.'); return; } const date=today(); const tab: Tab = { id: crypto.randomUUID(), name: t('wordUntitled'), bytes: blankWordDocument(), source: 'blank', templateName: 'Templates', day: date.day, month: date.month, dirty: true, saving: false, error: '', readonlyReason: '', revision: 0 }; if (!warmFailed && !warmId.current) warmId.current = tab.id; tabsRef.current = [...tabsRef.current, tab]; setTabs(tabsRef.current); setShowTemplates(false); setActive(tab.id); activeRef.current = tab.id; lastActiveRef.current = tab.id; setSplit(''); splitRef.current = ''; void ensureFonts(); } catch (error) { setStatus(issue(error)); } finally { setBusy(false); } };
  const openWorkspace = () => { const id = tabsRef.current.some(tab => tab.id === lastActiveRef.current) ? lastActiveRef.current : tabsRef.current.at(-1)?.id; if (id) activate(id); else create(); };
  createRef.current = create;
  const importTemplate = async (source: string, name: string, replace = false) => { setBusy(true); try { await wordBridge.importTemplate(source, name, 'General', 'Document', replace); setConflict(null); await refresh(); } catch (error) { if (issue(error).includes('already exists')) setConflict({ source, name }); else setStatus(issue(error)); } finally { setBusy(false); } };
  const shown = filterTemplates(templates, templateTab === 'favorites', templateSearch, language === 'VI' ? 'vi-VN' : 'en-US');
  const shownRecent = filterRecentDocuments(recent, recentTab === 'favorites', recentFilter);
  const toggleTemplatePin = async (row: TemplateEntry) => { try { await wordBridge.pinTemplate(row.path, !row.pinned); setTemplates(rows => rows.map(item => item.path === row.path ? { ...item, pinned: !row.pinned } : item)); } catch (error) { setStatus(issue(error)); } };
  const toggleRecentFavorite = async (row: RecentDocument) => { const pinned = !row.pinned; try { await wordBridge.updateRecent(row.path, pinned ? 'pin' : 'unpin'); setRecent(rows => rows.map(item => item.path === row.path ? { ...item, pinned } : item).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned))); } catch (error) { setStatus(issue(error)); } };
  const recentAction = async (row: RecentDocument, action: 'remove' | 'delete' | 'rename' | 'location') => {
    if (action === 'location') { try { await wordBridge.openRecentLocation(row.path); setRecentMenu(''); } catch (error) { setStatus(issue(error)); } return; }
    const name = action === 'rename' ? window.prompt(t('wordNamePrompt'), row.name) : undefined;
    if (action === 'rename' && name === null) return;
    if (action === 'delete' && !window.confirm(t('wordDeleteConfirm'))) return;
    try { await wordBridge.updateRecent(row.path, action, name ?? undefined); setRecentMenu(''); await refresh(); }
    catch (error) { setStatus(issue(error)); }
  };
  const warmTab = tabs.find(tab => tab.id === warmId.current) ?? null;
  const prewarming = visible && !warmFailed && !warmId.current;
  const editor = (tab: Tab | null, key: string) => <WordcraftEditor key={key} tab={tab} active={tab ? !showTemplates && (active === tab.id || split === tab.id) : true} language={language}
    register={access => { if (!tab) return; if (access) editors.current.set(tab.id, access); else editors.current.delete(tab.id); }}
    onChange={() => { if (tab) update(tab.id, { dirty: true, revision: (tabsRef.current.find(row => row.id === tab.id)?.revision || 0) + 1 }); }}
    onFailed={(kind, reason) => { if (tab) update(tab.id, { readonlyReason: reason, error: reason, failureKind: kind }); else setWarmFailed(true); }}
    onReady={() => { if (!tab) return; const current = tabsRef.current.find(row => row.id === tab.id); if (current?.failureKind === 'startup' || current?.failureKind === 'import') update(tab.id, { readonlyReason: '', error: '', failureKind: undefined }); }}
    onCompatibilityWarning={reason => { if (tab) setCompatibilityWarning({ tabId: tab.id, message: reason }); }}
    onBackstageChange={backstage => { if (tab) setBackstageByTab(current => current[tab.id] === backstage ? current : { ...current, [tab.id]: backstage }); }}
    onOpen={openDocument} onNew={create} onCloseAll={saveFirst => void closeAllFiles(saveFirst)} onHostSave={(bytes, as) => tab ? save(tab.id, as, bytes) : Promise.resolve(false)}/>;
  return <><div className="word-workspace" hidden={!visible}>
    <div hidden={!!active && !showTemplates} className="word-home"><header className="word-home-head"><div><p className="eyebrow">{t('wordLocal')}</p><h1>{t('wordTemplates')}</h1><p className="intro">{t('wordIntro')}</p></div><div><button onClick={openWorkspace}>{t('wordWorkspace')}</button><button className="primary-button" onClick={create}>{t('wordCreate')}</button><button onClick={() => void wordBridge.pickTemplateFile().then(file => { if (typeof file === 'string') void importTemplate(file, cleanName(file.split(/[\\/]/).pop() || '')); })}>{t('wordImport')}</button><button onClick={openDocument}>{t('wordOpen')}</button></div></header>
      {status && <p role="alert" className="word-alert">{status}</p>}{busy && <p role="status">{t('wordLoading')}</p>}
    <section className="word-section"><div className="word-section-head word-template-heading"><div className="word-template-tabs" role="tablist" aria-label={t('wordLibrary')}><button type="button" id="word-templates-tab" role="tab" aria-controls="word-template-panel" aria-selected={templateTab === 'templates'} tabIndex={templateTab === 'templates' ? 0 : -1} onClick={() => { setTemplateTab('templates'); setDetail(null); }} onKeyDown={event => { const buttons = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]') || []); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? 1 : -1; if (next >= 0) { event.preventDefault(); buttons[next]?.focus(); setTemplateTab(next === 0 ? 'templates' : 'favorites'); setDetail(null); } }}>{t('wordLibrary')}</button><button type="button" id="word-favorites-tab" role="tab" aria-controls="word-template-panel" aria-selected={templateTab === 'favorites'} tabIndex={templateTab === 'favorites' ? 0 : -1} onClick={() => { setTemplateTab('favorites'); setDetail(null); }} onKeyDown={event => { const buttons = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]') || []); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : event.key === 'ArrowRight' ? 0 : event.key === 'ArrowLeft' ? 0 : -1; if (next >= 0) { event.preventDefault(); buttons[next]?.focus(); setTemplateTab(next === 0 ? 'templates' : 'favorites'); setDetail(null); } }}>{t('wordFavorites')}</button></div><div className="word-template-controls"><input className="word-template-search" type="search" value={templateSearch} onChange={event => setTemplateSearch(event.target.value)} placeholder={t('wordSearchTemplates')} aria-label={t('wordSearchTemplates')}/><select className="word-template-view" aria-label={t('wordTemplateView')} value={templateView} onChange={event => setTemplateView(event.target.value as 'large' | 'details')}><option value="large">{t('wordLargeIcons')}</option><option value="details">{t('wordDetails')}</option></select></div></div>{detail ? <div className="word-detail" role="tabpanel" id="word-template-panel" aria-labelledby={templateTab === 'templates' ? 'word-templates-tab' : 'word-favorites-tab'}><button onClick={() => setDetail(null)}>&#8592; {t('wordBack')}</button><img src="./doc.ico" alt=""/><h3>{detail.name}</h3><p>{detail.topic} &middot; {detail.kind} &middot; {(detail.size/1024).toFixed(0)} KB</p>{detail.error && <p role="alert">{detail.error}</p>}<button className="primary-button" disabled={!!detail.error} onClick={() => openKnownFile(detail.path, wordBridge.readTemplate)}>{t('wordUseTemplate')}</button>{previewBytes && <div className="word-preview"><Suspense fallback={null}><DocxEditor document={previewBytes} fonts={fonts || undefined} mode="view" chrome={false} navigation={false} rulers={false}/></Suspense></div>}</div> : <div role="tabpanel" id="word-template-panel" aria-labelledby={templateTab === 'templates' ? 'word-templates-tab' : 'word-favorites-tab'} className={`word-template-grid${templateView === 'details' ? ' is-details' : ''}`}>{templateView === 'details' && <div className="word-template-detail-head"><span>{t('wordTemplateName')}</span><span>{t('wordTemplateSize')}</span><span>{t('wordTemplateModified')}</span></div>}{shown.map(row => <div key={row.path} className={templateView === 'details' ? 'word-template-detail-row' : 'word-template-card'}>{templateView === 'details' ? <button className="word-template-detail" onClick={() => setDetail(row)}><span className="word-template-detail-name"><img src="./doc.ico" alt=""/><span><strong>{row.name}</strong><small>{row.topic} &middot; {row.kind}{row.error ? ` ? ${row.error}` : ''}</small></span></span><span>{(row.size/1024).toFixed(0)} KB</span><time>{recentDate(row.modified, language)}</time></button> : <button className="word-template" onClick={() => setDetail(row)}><img src="./doc.ico" alt=""/><strong>{row.name}</strong><small>{row.topic} &middot; {row.kind}</small>{row.error && <small className="word-alert">{row.error}</small>}</button>}<button type="button" className="word-template-pin" aria-label={t(row.pinned ? 'wordTemplateUnpin' : 'wordTemplatePin')} title={t(row.pinned ? 'wordTemplateUnpin' : 'wordTemplatePin')} aria-pressed={row.pinned} onClick={() => void toggleTemplatePin(row)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 2.8 2.85 5.78 6.38.93 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93L12 2.8Z" fill={row.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg></button></div>)}{shown.length === 0 && <p>{templateTab === 'favorites' ? t('wordEmptyFavorites') : t('wordEmpty')}</p>}</div>}</section>
      <section className="word-section word-recent-section"><div className="word-recent-heading"><div><div className="word-recent-tabs" role="tablist" aria-label={t('wordRecent')}><button type="button" role="tab" id="word-recent-tab" aria-controls="word-recent-panel" aria-selected={recentTab === 'recent'} tabIndex={recentTab === 'recent' ? 0 : -1} onClick={() => setRecentTab('recent')} onKeyDown={recentTabKeyDown}>{t('wordRecent')}</button><button type="button" role="tab" id="word-recent-favorites-tab" aria-controls="word-recent-panel" aria-selected={recentTab === 'favorites'} tabIndex={recentTab === 'favorites' ? 0 : -1} onClick={() => setRecentTab('favorites')} onKeyDown={recentTabKeyDown}>{t('wordFavorites')}</button></div><p>{t('wordRecentDescription')}</p></div><div className="word-recent-filters" role="group" aria-label={t('wordRecentStatus')}>{(['all', 'managed', 'other'] as const).map(filter => <button key={filter} type="button" aria-pressed={recentFilter === filter} onClick={() => setRecentFilter(filter)}>{t(filter === 'all' ? 'wordRecentAll' : filter === 'managed' ? 'wordRecentManaged' : 'wordRecentOther')}</button>)}</div></div><div className="word-recent-columns" aria-hidden="true"><span>{t('wordFileName')}</span><span>{t('wordRecentStatus')}</span><span/><span>{t('wordModified')}</span><span/></div><div className="word-recent" role="tabpanel" id="word-recent-panel" aria-labelledby={recentTab === 'recent' ? 'word-recent-tab' : 'word-recent-favorites-tab'}>{shownRecent.map(row => <div key={row.path} className="word-recent-row"><button type="button" className="word-recent-open" onClick={() => openKnownFile(row.path, wordBridge.openRecent)}><span className="word-recent-file"><img src="./doc.ico" alt=""/><span><strong>{row.name.endsWith('.docx')?row.name:`${row.name}.docx`}</strong><small>DOCX{row.size > 0 && <> &middot; {(row.size/1024).toFixed(0)} KB</>}</small></span></span></button><span className="word-recent-status-cell"><span className={`word-recent-status${row.managed === true ? ' is-managed' : ''}`}>{t(row.managed === true ? 'wordRecentManagedStatus' : 'wordRecentOtherStatus')}</span></span><button type="button" className="word-recent-favorite" aria-label={t(row.pinned ? 'wordRecentRemoveFavorite' : 'wordRecentAddFavorite')} title={t(row.pinned ? 'wordRecentRemoveFavorite' : 'wordRecentAddFavorite')} aria-pressed={!!row.pinned} onClick={() => void toggleRecentFavorite(row)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 2.8 2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93L12 2.8Z" fill={row.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg></button><time className="word-recent-modified">{recentDate(row.modified, language)}</time><RecentFileMenu open={recentMenu === row.path} onOpenChange={value => setRecentMenu(value ? row.path : '')} onAction={action => action === 'quick' ? (setRecentMenu(''), openKnownFile(row.path, wordBridge.openRecent)) : void recentAction(row, action)} t={t}/></div>)}{!shownRecent.length && <p>{recentTab === 'favorites' ? recent.some(row => row.pinned) ? t('wordNoMatchingRecent') : t('wordRecentFavoritesEmpty') : recent.length ? t('wordNoMatchingRecent') : t('wordNoRecent')}</p>}</div></section>
    </div>
    {active && !showTemplates && compatibilityWarning?.tabId === active && showCompatibilityWarnings && compatibilityWarning.message !== tabs.find(row => row.id === active)?.error && <p className="word-alert" role="status">{compatibilityWarning.message}<button type="button" onClick={() => { setShowCompatibilityWarnings(false); setCompatibilityWarning(null); void wordBridge.settings().then(settings => wordBridge.saveSettings({ ...settings, showDocxCompatibilityWarnings: false })).catch(error => setStatus(issue(error))); }}>{t('wordDisableCompatibilityWarnings')}</button></p>}
    {active && !showTemplates && (status || tabs.find(row => row.id === active)?.error) && <p className="word-alert" role="alert">{tabs.find(row => row.id === active)?.error || status}<button className="page-button" type="button" onClick={() => { setStatus(''); update(active, { error: '' }); }}>{t('dismiss')}</button></p>}
    <div className={`word-editors${split ? ' is-split' : ''}${prewarming ? ' is-prewarming' : ''}`} hidden={(!active || showTemplates) && !prewarming} inert={prewarming} aria-hidden={prewarming}>
      {showEditorChrome && <button className="word-templates-back" type="button" onClick={() => setShowTemplates(true)} aria-label={`${t('wordBack')} ${t('wordLibrary')}`} title={`${t('wordBack')} ${t('wordLibrary')}`}><img src="./doc.ico" alt=""/></button>}
      {showEditorChrome && <div className="word-tabbar"><div className="word-tabs" ref={tabStripRef}>
        {tabs.map(tab => <div key={tab.id} className={active === tab.id ? 'active' : split === tab.id ? 'secondary' : ''}>
          <button className="word-tab-title" type="button" aria-current={active === tab.id ? 'page' : undefined} title={tab.name} onClick={() => activate(tab.id)}><span>{tab.name}</span></button>
          {tab.dirty && <span className="word-tab-dirty" aria-label={language === 'VI' ? 'Chưa lưu' : 'Unsaved changes'} title={language === 'VI' ? 'Chưa lưu' : 'Unsaved changes'}>•</span>}
          <button className="word-tab-beside" type="button" disabled={active === tab.id} aria-label={language === 'VI' ? `Hiện ${tab.name} bên cạnh` : `Show ${tab.name} beside`} title={language === 'VI' ? 'Hiện bên cạnh' : 'Show beside'} onClick={() => showBeside(tab.id)}>⇄</button>
          <button className="word-tab-close" type="button" aria-label={`${t('wordClose')} ${tab.name}`} title={`${t('wordClose')} ${tab.name}`} onClick={() => close(tab.id)}>×</button>
        </div>)}
      </div></div>}<Suspense fallback={null}>{!warmFailed && (prewarming || warmTab) && editor(warmTab, 'warm')}{tabs.filter(tab => startedIds.has(tab.id) && (warmFailed || tab.id !== warmId.current)).map(tab => editor(tab, tab.id))}</Suspense></div>
    {conflict && <div className="word-modal-backdrop"><section role="dialog" aria-modal="true" aria-label={t('wordConflict')} className="word-modal"><h2>{t('wordConflict')}</h2><p>{conflict.name}.docx</p><div><button onClick={() => { const name=window.prompt(t('wordNamePrompt'), conflict.name + ' 2'); if (name) void importTemplate(conflict.source, cleanName(name)); }}>{t('wordRename')}</button><button onClick={() => void importTemplate(conflict.source, conflict.name, true)}>{t('wordReplace')}</button><button onClick={() => setConflict(null)}>{t('wordCancel')}</button></div></section></div>}
  </div>{pending && <div className="word-modal-backdrop"><section role="dialog" aria-modal="true" aria-label={t('wordUnsavedTitle')} className="word-modal"><h2>{t('wordUnsavedTitle')}</h2><p>{t('wordUnsavedPrompt')}</p>{tabs.find(row=>row.id===pending.id)?.error && <p className="word-alert" role="alert">{tabs.find(row=>row.id===pending.id)?.error}</p>}<div><button className="primary-button" disabled={tabs.find(row=>row.id===pending.id)?.saving} onClick={() => void finishClose(true)}>{t('wordSave')}</button><button onClick={() => void keepDraftAndClose()}>{language === 'VI' ? 'Giữ bản nháp và đóng' : 'Keep Draft and Close'}</button><button onClick={() => void finishClose(false)}>{t('wordDontSave')}</button><button onClick={() => { closeAllRef.current = false; setPending(null); }}>{t('wordCancel')}</button></div></section></div>}</>;
}
