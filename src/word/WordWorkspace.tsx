import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { blankWordDocument, decodeDocx, fontConfiguration } from './docx';
import { DocumentEditor, type Tab, type EditorAccess } from './DocumentEditor';
import { DocxEditor } from '@docx-editor.dev/react';
import type { FontConfigurationFragment } from '@docx-editor.dev/core/editor';
import { wordBridge, type TemplateEntry, type RecentDocument, type WordPayload, type WordSettings } from './bridge';
import en from '../locales/en.json';

type T = (key: keyof typeof en) => string;
type Pending = { id: string; window: boolean };
const today = () => { const date = new Date(); return { day: String(date.getDate()).padStart(2, '0'), month: String(date.getMonth()+1).padStart(2, '0') }; };
const issue = (error: unknown) => String(error instanceof Error ? error.message : error);
const cleanName = (name: string) => name.replace(/\.docx$/i, '').trim();

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
    {(['templatesDirectory','documentsDirectory'] as const).map(key => <label key={key}>{t(key)}<span><input value={settings[key]} onChange={event => setSettings({ ...settings, [key]: event.target.value })}/><button type="button" onClick={() => void choose(key)}>{t('wordBrowse')}</button></span></label>)}
    <label className="word-check"><input type="checkbox" checked={settings.scanOnLaunch} onChange={event => setSettings({ ...settings, scanOnLaunch: event.target.checked })}/>{t('scanOnLaunch')}</label>
    <button className="primary-button" type="button" onClick={() => void wordBridge.saveSettings(settings).then(value => {setSettings(value);setStatus(t('wordSaved'));}).catch(error => setStatus(issue(error)))}>{t('settingsSave')}</button><output role="status">{status}</output>
  </section>;
}

export default function WordWorkspace({ visible, language, t }: { visible: boolean; language: 'EN'|'VI'; t: T }) {
  const [templates, setTemplates] = useState<TemplateEntry[]>([]), [recent, setRecent] = useState<RecentDocument[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]), [active, setActive] = useState(''), [split, setSplit] = useState(''), [detail, setDetail] = useState<TemplateEntry | null>(null);
  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null);
  const [fonts, setFonts] = useState<FontConfigurationFragment | null>(null);
  const [topic, setTopic] = useState(''), [kind, setKind] = useState(''), [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null), [conflict, setConflict] = useState<{ source: string; name: string } | null>(null);
  const tabsRef = useRef(tabs), closeAllowed = useRef(false), saveRef = useRef<(id: string, as?: boolean) => Promise<boolean>>(async () => false);
  const editors = useRef(new Map<string, EditorAccess>());
  const fontsPromise = useRef<Promise<FontConfigurationFragment> | null>(null);
  const ensureFonts = () => {
    if (!fontsPromise.current) fontsPromise.current = wordBridge.localFonts().then(faces => { const value = fontConfiguration(faces); setFonts(value); return value; });
    return fontsPromise.current;
  };
  tabsRef.current = tabs;
  const refresh = async () => { try { const [items, rows] = await Promise.all([wordBridge.templates(), wordBridge.recent()]); setTemplates(items); setRecent(rows); setStatus(''); } catch (error) { setStatus(issue(error)); } };
  useEffect(() => { void wordBridge.settings().then(settings => { if (settings.scanOnLaunch) void refresh(); }); }, []);
  useEffect(() => { if (visible) void refresh(); }, [visible]);
  useEffect(() => { setPreviewBytes(null); if (!detail || detail.error) return; let live=true; void ensureFonts(); void wordBridge.readTemplate(detail.path).then(payload => { if (live) setPreviewBytes(decodeDocx(payload.bytesBase64)); }).catch(error => { if (live) setStatus(issue(error)); }); return () => { live=false; }; }, [detail]);
  useEffect(() => { let unlisten: (() => void) | undefined; void getCurrentWindow().onCloseRequested(event => { if (closeAllowed.current) return; const dirty = tabsRef.current.find(tab => tab.dirty); if (dirty) { event.preventDefault(); setPending({ id: dirty.id, window: true }); } }).then(fn => unlisten = fn); return () => unlisten?.(); }, []);
  useEffect(() => { if (!visible) return; const onKey = (event: KeyboardEvent) => { if (!(event.ctrlKey || event.metaKey)) return; const key=event.key.toLowerCase(); if (key==='s' && active) { event.preventDefault(); void saveRef.current(active, event.shiftKey); } else if (key==='o') { event.preventDefault(); openDocument(); } else if (key==='p' && active) { event.preventDefault(); void editors.current.get(active)?.print(); } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [visible, active]);
  const update = (id: string, change: Partial<Tab>) => setTabs(rows => rows.map(row => row.id === id ? { ...row, ...change } : row));
  const openPayload = (payload: WordPayload, show = true) => {
    const prior = tabsRef.current.find(tab => tab.sourceFile === payload.file);
    if (prior) { if (show) { if (prior.id === split) setSplit(active); setActive(prior.id); update(prior.id, { mounted: true }); setDetail(null); } return; }
    const date = today(); try { const tab: Tab = { id: crypto.randomUUID(), name: payload.name, bytes: decodeDocx(payload.bytesBase64), path: payload.source === 'managed' ? payload.file : undefined, sourceFile: payload.file, hash: payload.hash, source: payload.source, templateName: payload.templateName || payload.name, day: payload.day || date.day, month: payload.month || date.month, dirty: payload.source !== 'managed', saving: false, error: '', readonlyReason: '', revision: 0, mounted: show }; tabsRef.current = [...tabsRef.current, tab]; setTabs(tabsRef.current); if (show) { setActive(tab.id); setSplit(''); setDetail(null); void ensureFonts().catch(error => { const message = issue(error); setStatus(message); update(tab.id, { readonlyReason: message }); }); } } catch (error) { setStatus(issue(error)); }
  };
  const openDocument = () => { void wordBridge.pickDocuments().then(files => files.forEach((file, index) => openPayload(file, index === files.length - 1))).catch(error => setStatus(issue(error))); };
  const save = async (id: string, as = false): Promise<boolean> => {
    const tab = tabsRef.current.find(row => row.id === id); if (!tab || tab.readonlyReason || tab.saving) return false;
    let name = tab.name;
    if (as || !tab.path) { const answer = window.prompt(t('wordNamePrompt'), tab.name); if (answer === null) return false; name = cleanName(answer); if (!name) return false; }
    update(id, { saving: true, error: '' });
    try { const access = editors.current.get(id); if (!access) throw Error('The editor is not ready.'); const bytesBase64 = await access.save(); const result = await wordBridge.saveDocument({ bytesBase64, name, templateName: tab.templateName, day: tab.day, month: tab.month, currentPath: as ? undefined : tab.path, expectedHash: as ? undefined : tab.hash }); const changedDuringSave = tabsRef.current.find(row => row.id === id)?.revision !== tab.revision; setTabs(rows => rows.map(row => row.id === id ? { ...row, name, path: result.path, sourceFile: result.path, hash: result.hash, source: 'managed', saving: false, dirty: row.revision !== tab.revision } : row)); void refresh(); return !changedDuringSave; }
    catch (error) { update(id, { saving: false, error: issue(error) }); return false; }
  };
  saveRef.current = save;
  const activate = (id: string) => { if (id === split) setSplit(active); setActive(id); update(id, { mounted: true }); void ensureFonts().catch(error => { const message = issue(error); setStatus(message); update(id, { readonlyReason: message }); }); };
  const showBeside = (id: string) => { setSplit(split === id ? '' : id); update(id, { mounted: true }); void ensureFonts().catch(error => { const message = issue(error); setStatus(message); update(id, { readonlyReason: message }); }); };
  const removeTab = (id: string) => {
    const next = active === id ? split && split !== id ? split : tabsRef.current.find(row => row.id !== id)?.id || '' : active;
    setTabs(rows => rows.filter(row => row.id !== id));
    if (active === id) setActive(next);
    if (split === id || split === next) setSplit('');
  };
  const close = (id: string) => { const tab = tabsRef.current.find(row => row.id === id); if (!tab) return; if (tab.dirty) { setPending({ id, window: false }); return; } removeTab(id); };
  const finishClose = async (saveFirst: boolean) => { if (!pending) return; if (saveFirst && !await save(pending.id)) return; const wasWindow = pending.window; const id = pending.id; setPending(null); if (wasWindow) { const next = tabsRef.current.find(row => row.id !== id && row.dirty); if (next) setPending({ id: next.id, window: true }); else { closeAllowed.current = true; await getCurrentWindow().close(); } } else removeTab(id); };
  const create = () => { const date=today(); const tab: Tab = { id: crypto.randomUUID(), name: t('wordUntitled'), bytes: blankWordDocument(), source: 'blank', templateName: t('wordUntitled'), day: date.day, month: date.month, dirty: true, saving: false, error: '', readonlyReason: '', revision: 0, mounted: true }; tabsRef.current = [...tabsRef.current, tab]; setTabs(tabsRef.current); setActive(tab.id); void ensureFonts(); };
  const importTemplate = async (source: string, name: string, replace = false) => { setBusy(true); try { await wordBridge.importTemplate(source, name, 'General', 'Document', replace); setConflict(null); await refresh(); } catch (error) { if (issue(error).includes('already exists')) setConflict({ source, name }); else setStatus(issue(error)); } finally { setBusy(false); } };
  const topics = [...new Set(templates.map(row => row.topic))], kinds = [...new Set(templates.map(row => row.kind))];
  const shown = templates.filter(row => (!topic || row.topic === topic) && (!kind || row.kind === kind));
  return <div className="word-workspace" hidden={!visible}>
    <div hidden={!!active} className="word-home"><header className="word-home-head"><div><p className="eyebrow">{t('wordLocal')}</p><h1>{t('wordTemplates')}</h1><p className="intro">{t('wordIntro')}</p></div><div><button className="primary-button" onClick={create}>{t('wordCreate')}</button><button onClick={() => void wordBridge.pickTemplateFile().then(file => { if (typeof file === 'string') void importTemplate(file, cleanName(file.split(/[\\/]/).pop() || '')); })}>{t('wordImport')}</button><button onClick={openDocument}>{t('wordOpen')}</button></div></header>
      {status && <p role="alert" className="word-alert">{status}</p>}{busy && <p role="status">{t('wordLoading')}</p>}
      <section className="word-section"><div className="word-section-head"><h2>{t('wordTopics')}</h2><span>{templates.length} {language==='EN'&&templates.length===1?'file':t('wordFiles')}</span></div><div className="word-topic-row"><button className={!topic ? 'active' : ''} onClick={() => setTopic('')}>{t('wordAll')}</button>{topics.map(value => <button className={topic === value ? 'active' : ''} key={value} onClick={() => setTopic(value)}>{value} <b>{templates.filter(row => row.topic === value).length}</b></button>)}</div></section>
      <section className="word-section"><div className="word-section-head"><h2>{t('wordTypes')}</h2></div><div className="word-topic-row"><button className={!kind ? 'active' : ''} onClick={() => setKind('')}>{t('wordAll')}</button>{kinds.map(value => <button className={kind === value ? 'active' : ''} key={value} onClick={() => setKind(value)}>{value} <b>{templates.filter(row => row.kind === value).length}</b></button>)}</div></section>
      <section className="word-section"><h2>{t('wordLibrary')}</h2>{detail ? <div className="word-detail"><button onClick={() => setDetail(null)}>← {t('wordBack')}</button><img src="./doc.ico" alt=""/><h3>{detail.name}</h3><p>{detail.topic} · {detail.kind} · {(detail.size/1024).toFixed(0)} KB</p>{detail.error && <p role="alert">{detail.error}</p>}<button className="primary-button" disabled={!!detail.error} onClick={() => void wordBridge.readTemplate(detail.path).then(openPayload).catch(error => setStatus(issue(error)))}>{t('wordUseTemplate')}</button>{previewBytes && <div className="word-preview"><DocxEditor document={previewBytes} fonts={fonts || undefined} mode="view" chrome={false} navigation={false} rulers={false}/></div>}</div> : <div className="word-template-grid">{shown.map(row => <button key={row.path} className="word-template" onClick={() => setDetail(row)}><img src="./doc.ico" alt=""/><strong>{row.name}</strong><small>{row.topic} · {row.kind}</small>{row.error && <small className="word-alert">{row.error}</small>}</button>)}{shown.length === 0 && <p>{t('wordEmpty')}</p>}</div>}</section>
      <section className="word-section"><h2>{t('wordRecent')}</h2><div className="word-recent">{recent.map(row => <button key={row.path} onClick={() => void wordBridge.openRecent(row.path).then(openPayload).catch(error => setStatus(issue(error)))}><img src="./doc.ico" alt=""/><span><strong>{row.name.endsWith('.docx')?row.name:`${row.name}.docx`}</strong><small>{row.path}{row.size ? ` · ${(row.size/1024).toFixed(0)} KB` : ''}</small></span><time>{new Date(row.modified*1000).toLocaleDateString(language === 'VI' ? 'vi-VN' : 'en-US')}</time></button>)}{!recent.length && <p>{t('wordNoRecent')}</p>}</div></section>
    </div>
    <div className="word-tabs" hidden={!active}><button className="word-back" onClick={() => { setActive(''); setSplit(''); }} aria-label={t('wordTemplates')} title={t('wordTemplates')}><img src="./doc.ico" alt=""/></button>{tabs.map(tab => <div key={tab.id} className={active === tab.id ? 'active' : split === tab.id ? 'secondary' : ''}><button onClick={() => activate(tab.id)}>{tab.name}{tab.dirty ? ' •' : ''}</button><button type="button" disabled={active === tab.id} aria-label={language === 'VI' ? `Hiện ${tab.name} bên cạnh` : `Show ${tab.name} beside`} title={language === 'VI' ? 'Hiện bên cạnh' : 'Show beside'} onClick={() => showBeside(tab.id)}>⇄</button><button aria-label={`${t('wordClose')} ${tab.name}`} onClick={() => close(tab.id)}>×</button></div>)}</div>
    <div className={`word-editors${split ? ' is-split' : ''}`} hidden={!active}>{tabs.filter(tab => tab.mounted).map(tab => <DocumentEditor key={tab.id} tab={tab} active={active === tab.id || split === tab.id} primary={active === tab.id} fonts={active === tab.id || split === tab.id ? fonts : null} language={language} t={t} register={access => { if (access) editors.current.set(tab.id, access); else editors.current.delete(tab.id); }} onChange={() => setTabs(rows => rows.map(row => row.id === tab.id ? { ...row, dirty: true, revision: row.revision + 1 } : row))} onSafety={reason => update(tab.id, { readonlyReason: reason, dirty: reason && tab.revision === 0 ? false : tab.dirty })} onOpen={openDocument} onSave={() => void save(tab.id)}/> )}</div>
    {pending && <div className="word-modal-backdrop"><section role="dialog" aria-modal="true" aria-label={t('wordUnsavedTitle')} className="word-modal"><h2>{t('wordUnsavedTitle')}</h2><p>{t('wordUnsavedPrompt')}</p>{tabs.find(row=>row.id===pending.id)?.error && <p className="word-alert" role="alert">{tabs.find(row=>row.id===pending.id)?.error}</p>}<div><button className="primary-button" disabled={tabs.find(row=>row.id===pending.id)?.saving} onClick={() => void finishClose(true)}>{t('wordSave')}</button><button onClick={() => void finishClose(false)}>{t('wordDontSave')}</button><button onClick={() => setPending(null)}>{t('wordCancel')}</button></div></section></div>}
    {conflict && <div className="word-modal-backdrop"><section role="dialog" aria-modal="true" aria-label={t('wordConflict')} className="word-modal"><h2>{t('wordConflict')}</h2><p>{conflict.name}.docx</p><div><button onClick={() => { const name=window.prompt(t('wordNamePrompt'), conflict.name + ' 2'); if (name) void importTemplate(conflict.source, cleanName(name)); }}>{t('wordRename')}</button><button onClick={() => void importTemplate(conflict.source, conflict.name, true)}>{t('wordReplace')}</button><button onClick={() => setConflict(null)}>{t('wordCancel')}</button></div></section></div>}
  </div>;
}
