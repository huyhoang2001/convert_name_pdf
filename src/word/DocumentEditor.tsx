import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DocxEditor, type DocxEditorRef } from '@docx-editor.dev/react';
import type { FontConfigurationFragment } from '@docx-editor.dev/core/editor';
import '@docx-editor.dev/core/styles/editor.css';
import { checkDocxRoundTrip, checkDocxSave, encodeDocx, preserveDocxSectionProperties, requiredDocumentFonts } from './docx';
import { printDocxPages } from './printDocument';
import { viDocx } from './viDocx';
import { nextWordZoom } from './zoom';
import type { WordPayload } from './bridge';
import en from '../locales/en.json';

export type Tab = { id: string; name: string; bytes: Uint8Array; path?: string; sourceFile?: string; hash?: string; source: WordPayload['source'] | 'blank'; templateName: string; day: string; month: string; dirty: boolean; saving: boolean; error: string; readonlyReason: string; revision: number; mounted: boolean };
export type EditorAccess = { save: () => Promise<string>; print: () => Promise<void> };
type T = (key: keyof typeof en) => string;

export function DocumentEditor({ tab, active, primary, fonts, register, onChange, onSafety, onOpen, onSave, t, language }: {
  tab: Tab; active: boolean; primary: boolean; fonts: FontConfigurationFragment | null; register: (access: EditorAccess | null) => void;
  onChange: () => void; onSafety: (reason: string) => void; onOpen: () => void; onSave: () => void;
  t: T; language: 'EN' | 'VI';
}) {
  const editorRef = useRef<DocxEditorRef>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [safe, setSafe] = useState(tab.source === 'blank');
  const [reason, setReason] = useState('');
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(true);
  const [searchTab, setSearchTab] = useState<'headings' | 'find' | 'goto'>('headings');
  const checked = useRef(false);
  const alive = useRef(true);
  const [printError, setPrintError] = useState('');
  const handlePrint = useCallback(async () => {
    setPrintError('');
    try {
      const pages = hostRef.current?.querySelector<HTMLElement>('.docx-pages');
      if (!pages) throw Error('The document pages are not ready to print.');
      await printDocxPages(pages);
    } catch (error) { setPrintError(String(error)); }
    finally { editorRef.current?.focus(); }
  }, []);
  useEffect(() => () => { alive.current = false; }, []);
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
        const failure = checkDocxSave(tab.bytes, outputBytes);
        if (failure) throw Error(failure);
        outputBytes = preserveDocxSectionProperties(tab.bytes, outputBytes);
      }
      return encodeDocx(outputBytes);
    } });
    return () => register(null);
  }, [safe, reason, tab.bytes, register, handlePrint]);

  const verify = async () => {
    if (!active || checked.current || tab.source === 'blank' || !fonts) return;
    const snapshot = editorRef.current?.snapshot();
    if (!snapshot || snapshot.isLoading || snapshot.isOpening) { window.setTimeout(() => void verify(), 250); return; }
    checked.current = true;
    let failure = snapshot.parseError || snapshot.openFailure?.reason || '';
    const available = new Set(fonts?.supportedFamilies?.map(family => family.toLowerCase()) || []);
    const missing = requiredDocumentFonts(tab.bytes).filter(family => !available.has(family.toLowerCase()));
    if (!failure && missing.length) failure = `Document font unavailable: ${missing.join(', ')}.`;
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
  useEffect(() => { void verify(); }, [fonts, active]);

  return <div className="word-editor" data-print-primary={primary || undefined} hidden={!active}>
    {(tab.error || printError) && <p className="word-error" role="alert">{tab.error || printError}</p>}
    {(reason || tab.readonlyReason) && <p className="word-safety" role="alert">{language === 'VI' ? 'Chỉ xem: ' : 'Read only: '}{reason || tab.readonlyReason}</p>}
    <div className="word-commandbar docx-editor" ref={setToolbarHost}/>
    <div className="word-docx-host" ref={hostRef}>
      <DocxEditor ref={editorRef} document={tab.bytes} fonts={fonts || undefined} mode={safe ? 'edit' : 'view'} title={tab.name} menu={{ reportIssue: false }} navigation={{ open: searchOpen, onOpenChange: setSearchOpen, tab: searchTab, onTabChange: setSearchTab }} rulers colorMode="light" onOpen={onOpen} onSave={onSave} i18n={language === 'VI' ? viDocx : undefined}
        locale={language === 'VI' ? 'vi-VN' : 'en-US'}
        onReady={() => { void verify(); }}
        onChange={change => { if (change.source === 'load' || change.source === 'refresh' || change.source === 'recovery') { void verify(); return; } onChange(); }}
        onFontError={error => { const message = String(error); setReason(message); setSafe(false); onSafety(message); }}>
        {toolbarHost && createPortal(<><div className="word-commandbar-menu"><DocxEditor.Menu onOpen={onOpen} onSave={onSave} reportIssue={false}><DocxEditor.Menu.File><DocxEditor.Menu.Print hidden/></DocxEditor.Menu.File></DocxEditor.Menu></div><div className="word-commandbar-scroll"><DocxEditor.Toolbar preset={false} onSave={onSave}>
          <button type="button" className="docx-toolbar__button" aria-label={language === 'VI' ? 'Tìm trong tài liệu' : 'Find in document'} title={language === 'VI' ? 'Tìm trong tài liệu' : 'Find in document'} onClick={() => { setSearchTab('find'); setSearchOpen(true); }}><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></button>
          <button type="button" className="docx-toolbar__button" aria-label={language === 'VI' ? 'Hiện dẫn hướng' : 'Show navigation'} aria-pressed={searchOpen} title={language === 'VI' ? 'Dẫn hướng' : 'Navigation'} onClick={() => { setSearchTab('headings'); setSearchOpen(open => !open); }}><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M12 8h6M12 12h6M12 16h4"/></svg></button>
          <DocxEditor.Toolbar.Separator/><DocxEditor.Toolbar.Undo/><DocxEditor.Toolbar.Redo/><button type="button" className="docx-toolbar__button" aria-label={language === 'VI' ? 'In tài liệu' : 'Print document'} title={language === 'VI' ? 'In tài liệu (Ctrl+P)' : 'Print document (Ctrl+P)'} onClick={() => void handlePrint()}><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1 2-2h-2M6 14h12v7H6z"/><path d="M18 12h.01"/></svg></button><DocxEditor.Toolbar.Button slotId="format.painter"/><DocxEditor.Toolbar.Zoom/>
          <DocxEditor.Toolbar.Separator/><DocxEditor.Toolbar.StylePicker/><DocxEditor.Toolbar.Separator/><DocxEditor.Toolbar.FontFamily/><DocxEditor.Toolbar.FontSize/>
          <DocxEditor.Toolbar.Separator/><DocxEditor.Toolbar.Bold/><DocxEditor.Toolbar.Italic/><DocxEditor.Toolbar.Underline/><DocxEditor.Toolbar.FontColor/><DocxEditor.Toolbar.Highlight/>
          <DocxEditor.Toolbar.Separator/><DocxEditor.Toolbar.Link/><DocxEditor.Toolbar.ImageInsert/><DocxEditor.Toolbar.Button slotId="insert.pageNumber"/><DocxEditor.Toolbar.Separator/><DocxEditor.Toolbar.Alignment/><DocxEditor.Toolbar.LineSpacing/>
          <DocxEditor.Toolbar.Separator/><DocxEditor.Toolbar.BulletList/><DocxEditor.Toolbar.NumberedList/>
          <DocxEditor.Toolbar.Separator/><DocxEditor.Toolbar.EditingMode/>
        </DocxEditor.Toolbar></div></>, toolbarHost)}
      </DocxEditor>
    </div>
  </div>;
}
