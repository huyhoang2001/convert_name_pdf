import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CHROME_MENUS, DocxEditor, type ChromeMenuEntry, type DocxEditorRef } from '@docx-editor.dev/react';
import type { FontConfigurationFragment } from '@docx-editor.dev/core/editor';
import '@docx-editor.dev/core/styles/editor.css';
import { checkDocxRoundTrip, checkDocxSave, encodeDocx, preserveDocxSectionProperties, requiredDocumentFonts, substituteMissingFonts } from './docx';
import { printDocxPages } from './printDocument';
import { changePageNumbers } from './pageNumbers';
import { viDocx } from './viDocx';
import { nextWordZoom } from './zoom';
import { RulerControls } from './RulerControls';
import { ReadPageOverview } from './ReadPageOverview';
import { shouldShowPrintOverview } from './readOverviewLayout';
import type { WordPayload } from './bridge';
import en from '../locales/en.json';

export type Tab = { id: string; name: string; bytes: Uint8Array; path?: string; sourceFile?: string; hash?: string; source: WordPayload['source'] | 'blank'; templateName: string; day: string; month: string; dirty: boolean; saving: boolean; error: string; readonlyReason: string; revision: number; mounted: boolean };
export type EditorAccess = { save: () => Promise<string>; print: () => Promise<void> };
type T = (key: keyof typeof en) => string;

const insertMenu = CHROME_MENUS.find(menu => menu.id === 'insert');
if (!insertMenu) throw Error('The document editor Insert menu is unavailable.');
const insertMenuEntries: readonly ChromeMenuEntry[] = insertMenu.entries.filter(entry => !('slot' in entry) || entry.slot !== 'table.insert');

export const DocumentEditor = memo(function DocumentEditor({ tab, active, primary, fonts, register, onChange, onSafety, onOpen, onSave, onNew, t, language, theme }: {
  tab: Tab; active: boolean; primary: boolean; fonts: FontConfigurationFragment | null; register: (access: EditorAccess | null) => void;
  onChange: () => void; onSafety: (reason: string) => void; onOpen: () => void; onSave: () => void; onNew: () => void;
  t: T; language: 'EN' | 'VI'; theme: 'light' | 'dark';
}) {
  const editorRef = useRef<DocxEditorRef>(null);
  const documentBaseline = useRef(tab.bytes);
  const hostRef = useRef<HTMLDivElement>(null);
  const readScrollPosition = useRef({ top: 0, left: 0 });
  const printScrollPosition = useRef({ top: 0, left: 0 });
  const printOverviewRef = useRef(false);
  const [activePrintPage, setActivePrintPage] = useState<number | null>(null);
  const [safe, setSafe] = useState(tab.source === 'blank');
  const [reason, setReason] = useState('');
  const [missingFonts, setMissingFonts] = useState<string[]>([]);
  const [fallbackFonts, setFallbackFonts] = useState<FontConfigurationFragment | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null);
  const [viewMode, setViewMode] = useState<'read' | 'print' | 'web'>('print');
  const [printOverview, setPrintOverview] = useState(false);
  const [searchOpen, setSearchOpen] = useState(true);
  const [searchTab, setSearchTab] = useState<'headings' | 'find' | 'goto'>('headings');
  const checked = useRef(false);
  const fontLoadFailure = useRef('');
  const alive = useRef(true);
  const [printError, setPrintError] = useState('');
  const [numberFormatOpen, setNumberFormatOpen] = useState(false);
  const [numberFormat, setNumberFormat] = useState<'decimal' | 'upperRoman' | 'lowerRoman'>('decimal');
  const [numberStart, setNumberStart] = useState(1);
  const editorFonts = fallbackFonts ?? fonts;
  const printTiles = viewMode === 'print' && printOverview;
  const selectPrintPage = useCallback((index: number) => setActivePrintPage(index), []);
  const leavePrintPage = useCallback(() => setActivePrintPage(null), []);
  const fallbackConfiguration = missingFonts.length && fonts ? substituteMissingFonts(fonts, missingFonts) : null;
  const applyFontFallback = (configuration: FontConfigurationFragment) => {
    fontLoadFailure.current = '';
    checked.current = false;
    setReason(''); setSafe(false); setMissingFonts([]); setFallbackFonts(configuration); setEditorVersion(version => version + 1);
    onSafety('');
  };
  const enableFontFallback = () => { if (fallbackConfiguration) applyFontFallback(fallbackConfiguration); };
  const updatePageNumbers = async (change: Parameters<typeof changePageNumbers>[1]) => {
    const editor = editorRef.current?.getEditor();
    if (!editor || !safe) throw Error('This document cannot be edited.');
    const bytes = new Uint8Array(await editor.save());
    const updated = changePageNumbers(bytes, change);
    documentBaseline.current = updated;
    editor.load(updated);
    onChange();
  };
  const insertPageNumber = async (position: 'header' | 'footer' | 'current', align: 'left' | 'center' | 'right', margin = false) => {
    setPrintError('');
    try {
      const editor = editorRef.current?.getEditor();
      if (!editor || !safe) throw Error('This document cannot be edited.');
      if (position === 'current' && !editor.getHeaderFooterState()) throw Error('Open a header or footer before inserting a page number at the current position.');
      if (position !== 'current') {
        const opened = editor.exec({ type: 'editHeaderFooter', position });
        if (!opened.ok) throw Error(opened.reason);
        const partName = editor.getHeaderFooterState()?.partName;
        if (partName) {
          await updatePageNumbers({ remove: true, partName });
          const reopened = editor.exec({ type: 'editHeaderFooter', position });
          if (!reopened.ok) throw Error(reopened.reason);
        }
      }
      if (position !== 'current') {
        const aligned = editor.exec({ type: 'setAlignment', align });
        if (!aligned.ok) throw Error(aligned.reason);
        if (margin) {
          const indented = editor.exec({ type: 'setIndent', [align === 'right' ? 'right' : 'left']: -720 });
          if (!indented.ok) throw Error(indented.reason);
        }
      }
      const inserted = editor.exec({ type: 'insertPageField', field: 'PAGE' });
      if (!inserted.ok) throw Error(inserted.reason);
      onChange();
    } catch (error) { setPrintError(String(error)); }
  };
  const formatPageNumbers = async () => {
    setPrintError('');
    try {
      if (!Number.isInteger(numberStart) || numberStart < 1 || numberStart > 32767) throw Error('The first page number must be between 1 and 32767.');
      const editor = editorRef.current?.getEditor();
      if (!editor) throw Error('The document editor is unavailable.');
      let sectionIndex = editor.getHeaderFooterState()?.sectionIndex;
      if (sectionIndex === undefined) {
        const opened = editor.exec({ type: 'editHeaderFooter', position: 'footer' });
        if (!opened.ok) throw Error(opened.reason);
        sectionIndex = editor.getHeaderFooterState()?.sectionIndex;
        editor.exec({ type: 'exitHeaderFooter' });
      }
      await updatePageNumbers({ sectionIndex, format: numberFormat, start: numberStart });
      setNumberFormatOpen(false);
    } catch (error) { setPrintError(String(error)); }
  };
  const pageNumberMenu = <DocxEditor.Menu.Submenu label={language === 'VI' ? 'Số trang' : 'Page Number'}>
    {(['header', 'footer'] as const).map(position => <DocxEditor.Menu.Submenu key={position} label={language === 'VI' ? position === 'header' ? 'Đầu trang' : 'Cuối trang' : position === 'header' ? 'Top of Page' : 'Bottom of Page'}>
      {(['left', 'center', 'right'] as const).map(align => <DocxEditor.Menu.Row key={align} disabled={!safe} onSelect={() => void insertPageNumber(position, align)}>{language === 'VI' ? { left: 'Trái', center: 'Giữa', right: 'Phải' }[align] : { left: 'Left', center: 'Center', right: 'Right' }[align]}</DocxEditor.Menu.Row>)}
    </DocxEditor.Menu.Submenu>)}
    <DocxEditor.Menu.Submenu label={language === 'VI' ? 'Lề trang' : 'Page Margins'}>
      {(['left', 'right'] as const).map(align => <DocxEditor.Menu.Row key={align} disabled={!safe} onSelect={() => void insertPageNumber('header', align, true)}>{language === 'VI' ? align === 'left' ? 'Lề trái' : 'Lề phải' : align === 'left' ? 'Left margin' : 'Right margin'}</DocxEditor.Menu.Row>)}
    </DocxEditor.Menu.Submenu>
    <DocxEditor.Menu.Row disabled={!safe} onSelect={() => void insertPageNumber('current', 'left')}>{language === 'VI' ? 'Vị trí hiện tại' : 'Current Position'}</DocxEditor.Menu.Row>
    <DocxEditor.Menu.Separator/>
    <DocxEditor.Menu.Row disabled={!safe} onSelect={() => setNumberFormatOpen(true)}>{language === 'VI' ? 'Định dạng số trang…' : 'Format Page Numbers…'}</DocxEditor.Menu.Row>
    <DocxEditor.Menu.Row disabled={!safe} onSelect={() => void updatePageNumbers({ remove: true }).catch(error => setPrintError(String(error)))}>{language === 'VI' ? 'Xóa số trang' : 'Remove Page Numbers'}</DocxEditor.Menu.Row>
  </DocxEditor.Menu.Submenu>;
  const handlePrint = useCallback(async () => {
    setPrintError('');
    try {
      const host = hostRef.current;
      if (!host) throw Error('The document pages are not ready to print.');
      const pages = host.querySelector<HTMLElement>('.docx-pages');
      if (!pages) throw Error('The document pages are not ready to print.');
      const editor = editorRef.current?.getEditor();
      if (!editor) throw Error('The document editor is not ready to print.');
      const deadline = Date.now() + 120_000;
      let snapshot = editorRef.current?.snapshot();
      while (snapshot && (snapshot.isLoading || snapshot.isOpening || host.querySelector('[data-docx-layout-pending]'))) {
        if (Date.now() >= deadline) throw Error('The document layout did not finish in time to print.');
        await new Promise(resolve => window.setTimeout(resolve, 50));
        snapshot = editorRef.current?.snapshot();
      }
      if (!snapshot || snapshot.page.total < 1) throw Error('The document pages are not ready to print.');
      const scroll = host.querySelector<HTMLElement>('.docx-editor__scroll-container');
      const savedScroll = { top: scroll?.scrollTop ?? 0, left: scroll?.scrollLeft ?? 0 };
      const savedVisibility = scroll?.style.visibility;
      if (scroll) scroll.style.visibility = 'hidden';
      try {
        await printDocxPages(pages, { pageCount: snapshot.page.total, zoom: editor.getZoom(), currentPageCount: () => editorRef.current?.snapshot()?.page.total ?? 0, revealPage: pageNumber => editor.scrollToPage(pageNumber) });
      } finally {
        if (scroll) {
          scroll.style.visibility = savedVisibility ?? '';
          scroll.scrollTop = savedScroll.top;
          scroll.scrollLeft = savedScroll.left;
        }
      }
    } catch (error) { setPrintError(String(error)); }
    finally { editorRef.current?.focus(); }
  }, []);
  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => { if (viewMode !== 'print') { printOverviewRef.current = false; setPrintOverview(false); setActivePrintPage(null); } }, [viewMode]);
  useEffect(() => { if (!printTiles || !safe) setActivePrintPage(null); }, [printTiles, safe]);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (event: WheelEvent) => {
      if (!active || !event.ctrlKey) return;
      const editor = editorRef.current?.getEditor();
      if (!editor) return;
      event.preventDefault();
      if (event.deltaY) editor.setZoom(nextWordZoom(editor.getZoom(), event.deltaY));
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, [active]);
  useEffect(() => {
    if (!active || viewMode !== 'print') return;
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      const editor = editorRef.current?.getEditor();
      const page = host.querySelector<HTMLElement>(':scope > .docx-editor:not(.word-read-overview) .docx-pages .docx-page');
      if (!editor || !page) return;
      const show = shouldShowPrintOverview(editor.getZoom(), host.clientWidth, page.getBoundingClientRect().width);
      if (show && !printOverviewRef.current) {
        const scroll = host.querySelector<HTMLElement>('.docx-editor__scroll-container');
        printScrollPosition.current.top = scroll?.scrollTop ?? 0;
        printScrollPosition.current.left = scroll?.scrollLeft ?? 0;
      }
      printOverviewRef.current = show;
      setPrintOverview(show);
    };
    const resize = new ResizeObserver(update);
    resize.observe(host);
    const timer = window.setInterval(update, 200);
    update();
    return () => { resize.disconnect(); window.clearInterval(timer); printOverviewRef.current = false; };
  }, [active, viewMode, editorVersion]);
  useEffect(() => {
    if (!printTiles || activePrintPage === null || !safe) return;
    let cancelled = false;
    const frame = window.requestAnimationFrame(async () => {
      const editor = editorRef.current?.getEditor();
      const source = hostRef.current?.querySelector<HTMLElement>('.docx-editor__scroll-container');
      if (!editor || !source) return;
      editor.scrollToPage(activePrintPage + 1);
      for (let attempt = 0; attempt < 30 && !cancelled; attempt++) {
        const page = hostRef.current?.querySelector<HTMLElement>(`:scope > .docx-editor:not(.word-read-overview) .docx-page[data-page-index="${activePrintPage}"]`);
        if (page) {
          source.scrollTop += page.getBoundingClientRect().top - source.getBoundingClientRect().top;
          editorRef.current?.focus();
          return;
        }
        await new Promise(resolve => window.setTimeout(resolve, 50));
      }
    });
    return () => { cancelled = true; window.cancelAnimationFrame(frame); };
  }, [printTiles, activePrintPage, safe]);
  useEffect(() => {
    if (!safe || !tab.path || !tab.dirty || tab.saving) return;
    const timer = window.setTimeout(onSave, 2500);
    return () => window.clearTimeout(timer);
  }, [safe, tab.path, tab.dirty, tab.revision, tab.saving, onSave]);

  useEffect(() => {
    register({ print: handlePrint, save: async () => {
      if (!safe) throw Error(reason || 'This document is read-only.');
      const output = await editorRef.current?.save();
      if (!output) throw Error('The editor has no document to save.');
      let outputBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(output);
      if (tab.source !== 'blank') {
        const failure = checkDocxSave(documentBaseline.current, outputBytes);
        if (failure) throw Error(failure);
        outputBytes = preserveDocxSectionProperties(documentBaseline.current, outputBytes);
      }
      return encodeDocx(outputBytes);
    } });
    return () => register(null);
  }, [safe, reason, tab.bytes, register, handlePrint]);

  const verify = async () => {
    if (!active || checked.current || tab.source === 'blank' || !editorFonts) return;
    const snapshot = editorRef.current?.snapshot();
    if (!snapshot || snapshot.isLoading || snapshot.isOpening) { window.setTimeout(() => void verify(), 250); return; }
    checked.current = true;
    let failure = snapshot.parseError || snapshot.openFailure?.reason || '';
    const available = new Set(editorFonts.supportedFamilies?.map(family => family.toLowerCase()) || []);
    const substituted = new Set(editorFonts.substitutions?.map(substitution => substitution.from.family.toLowerCase()) || []);
    const missing = requiredDocumentFonts(tab.bytes).filter(family => !available.has(family.toLowerCase()) && !substituted.has(family.toLowerCase()));
    setMissingFonts(failure ? [] : missing);
    if (!failure && missing.length) {
      const replacement = !fallbackFonts && fonts ? substituteMissingFonts(fonts, missing) : null;
      if (replacement) { applyFontFallback(replacement); return; }
      failure = `Document font unavailable: ${missing.join(', ')}.`;
    }
    if (!failure) failure = fontLoadFailure.current;
    if (!failure) {
      try {
        const output = await editorRef.current?.save();
        failure = output ? checkDocxRoundTrip(tab.bytes, new Uint8Array(output)) || '' : 'The editor could not serialize this document.';
      } catch (error) { failure = String(error); }
    }
    if (!alive.current) return;
    setReason(failure);
    setSafe(!failure);
    onSafety(failure);
  };
  useEffect(() => { void verify(); }, [fonts, fallbackFonts, active, editorVersion]);

  return <div className="word-editor" data-print-primary={primary || undefined} hidden={!active}>
    {(tab.error || printError) && <p className="word-error" role="alert">{tab.error || printError}</p>}
    {(reason || tab.readonlyReason) && <p className="word-safety" role="alert">{language === 'VI' ? 'Chỉ xem: ' : 'Read only: '}{reason || tab.readonlyReason}</p>}
    {fallbackFonts && <p className="word-fallback-notice" role="status">{t('wordFallbackLayoutWarning')}</p>}
    <div className={`word-commandbar docx-editor${theme === 'dark' ? ' dark' : ''}`} ref={setToolbarHost}/>
    <div className={`word-docx-host word-view-${viewMode}${printTiles ? ' word-print-overview' : ''}${printTiles && activePrintPage !== null && safe ? ' word-print-live' : ''}`} ref={hostRef}>
      <DocxEditor key={editorVersion} ref={editorRef} document={tab.bytes} fonts={editorFonts || undefined} mode={viewMode === 'read' || (printTiles && activePrintPage === null) || !safe ? 'view' : 'edit'} title={tab.name} menu={{ reportIssue: false }} navigation={{ open: searchOpen, onOpenChange: setSearchOpen, tab: searchTab, onTabChange: setSearchTab }} rulers colorMode={theme} onOpen={onOpen} onSave={onSave} i18n={language === 'VI' ? viDocx : undefined}
        locale={language === 'VI' ? 'vi-VN' : 'en-US'}
        onReady={() => { void verify(); }}
        onChange={change => { if (change.source === 'load' || change.source === 'refresh' || change.source === 'recovery') { void verify(); return; } onChange(); }}
        onFontError={error => { const message = String(error); if (!fallbackFonts) { fontLoadFailure.current = message; setReason(message); setSafe(false); onSafety(message); } checked.current = false; window.setTimeout(() => void verify(), 0); }}>
        <RulerControls host={hostRef} active={active} language={language}/><DocxEditor.Loading overlay indicator={<span data-docx-layout-pending>{t('wordLayingOutPages')}</span>}/>
        {toolbarHost && createPortal(<><div className="word-commandbar-menu"><DocxEditor.Menu onOpen={onOpen} onSave={onSave} reportIssue={false}><DocxEditor.Menu.File><DocxEditor.Menu.Row shortcut="Ctrl+N" onSelect={onNew}>{t('wordNewFile')}</DocxEditor.Menu.Row><DocxEditor.Menu.Print hidden/></DocxEditor.Menu.File><DocxEditor.Menu.Insert>{insertMenuEntries.map((entry, index) => <DocxEditor.Menu.Entry key={`${entry.kind}-${index}`} entry={entry}/>)}{pageNumberMenu}</DocxEditor.Menu.Insert></DocxEditor.Menu><div className="word-view-controls" role="group" aria-label={t('wordDocumentViews')}>{(['read','print','web'] as const).map(mode => <button key={mode} type="button" aria-pressed={viewMode === mode} onClick={() => { if (mode === 'read') { const scroll = hostRef.current?.querySelector<HTMLElement>('.docx-editor__scroll-container'); readScrollPosition.current = { top: scroll?.scrollTop ?? 0, left: scroll?.scrollLeft ?? 0 }; } setViewMode(mode); }}>{t(mode === 'read' ? 'wordReadMode' : mode === 'print' ? 'wordPrintLayout' : 'wordWebLayout')}</button>)}</div></div><div className="word-commandbar-scroll"><DocxEditor.Toolbar preset={false} onSave={onSave}>
          <button type="button" className="docx-toolbar__button" aria-label={language === 'VI' ? 'Tìm trong tài liệu' : 'Find in document'} title={language === 'VI' ? 'Tìm trong tài liệu' : 'Find in document'} onClick={() => { setSearchTab('find'); setSearchOpen(true); }}><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></button>
          <button type="button" className="docx-toolbar__button" aria-label={language === 'VI' ? 'Hiện dẫn hướng' : 'Show navigation'} aria-pressed={searchOpen} title={language === 'VI' ? 'Dẫn hướng' : 'Navigation'} onClick={() => { setSearchTab('headings'); setSearchOpen(open => !open); }}><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M12 8h6M12 12h6M12 16h4"/></svg></button>
          <DocxEditor.Toolbar.Separator/><DocxEditor.Toolbar.Undo/><DocxEditor.Toolbar.Redo/><button type="button" className="docx-toolbar__button" aria-label={language === 'VI' ? 'In tài liệu' : 'Print document'} title={language === 'VI' ? 'In tài liệu (Ctrl+P)' : 'Print document (Ctrl+P)'} onClick={() => void handlePrint()}><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1 2-2h-2M6 14h12v7H6z"/><path d="M18 12h.01"/></svg></button><DocxEditor.Toolbar.Button slotId="format.painter"/><DocxEditor.Toolbar.Zoom/>
          <DocxEditor.Toolbar.Separator/><DocxEditor.Toolbar.StylePicker/><DocxEditor.Toolbar.Separator/><DocxEditor.Toolbar.FontFamily/><DocxEditor.Toolbar.FontSize/>
          <DocxEditor.Toolbar.Separator/><DocxEditor.Toolbar.Bold/><DocxEditor.Toolbar.Italic/><DocxEditor.Toolbar.Underline/><DocxEditor.Toolbar.FontColor/><DocxEditor.Toolbar.Highlight/>
          <DocxEditor.Toolbar.Separator/><DocxEditor.Toolbar.Link/><DocxEditor.Toolbar.ImageInsert/><DocxEditor.Toolbar.Button slotId="insert.pageNumber"/><DocxEditor.Toolbar.Separator/><DocxEditor.Toolbar.Alignment/><DocxEditor.Toolbar.LineSpacing/>
          <DocxEditor.Toolbar.Separator/><DocxEditor.Toolbar.BulletList/><DocxEditor.Toolbar.NumberedList/>
          <DocxEditor.Toolbar.Separator/>{!safe && fallbackConfiguration && <button type="button" className="docx-toolbar__button word-font-fallback" onClick={enableFontFallback}>{t('wordEditWithFallbackFonts')}</button>}
        </DocxEditor.Toolbar></div></>, toolbarHost)}
      </DocxEditor>
      {active && (viewMode === 'read' || printTiles) && <ReadPageOverview key={viewMode} editorRef={editorRef} hostRef={hostRef} savedPosition={viewMode === 'read' ? readScrollPosition.current : printScrollPosition.current} language={language} activePage={printTiles ? activePrintPage : null} revision={tab.revision} onSelectPage={printTiles && safe ? selectPrintPage : undefined} onActivePageGone={leavePrintPage}/>}
    </div>
    {numberFormatOpen && <div className="word-modal-backdrop"><form className="word-modal" role="dialog" aria-modal="true" aria-label={language === 'VI' ? 'Định dạng số trang' : 'Format Page Numbers'} onSubmit={event => { event.preventDefault(); void formatPageNumbers(); }}>
      <h2>{language === 'VI' ? 'Định dạng số trang' : 'Format Page Numbers'}</h2>
      <label>{language === 'VI' ? 'Kiểu số' : 'Number format'} <select value={numberFormat} onChange={event => setNumberFormat(event.target.value as typeof numberFormat)}><option value="decimal">1, 2, 3</option><option value="upperRoman">I, II, III</option><option value="lowerRoman">i, ii, iii</option></select></label>
      <label>{language === 'VI' ? 'Bắt đầu từ' : 'Start at'} <input type="number" min="1" max="32767" required value={numberStart} onChange={event => setNumberStart(Number(event.target.value))}/></label>
      <div><button className="primary-button" type="submit">{language === 'VI' ? 'Áp dụng' : 'Apply'}</button><button type="button" onClick={() => setNumberFormatOpen(false)}>{language === 'VI' ? 'Hủy' : 'Cancel'}</button></div>
    </form></div>}
  </div>;
}, (previous, next) => previous.tab === next.tab && previous.active === next.active && previous.primary === next.primary && previous.fonts === next.fonts && previous.language === next.language && previous.theme === next.theme && previous.t === next.t);
