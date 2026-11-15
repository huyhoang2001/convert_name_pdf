import { memo, useEffect, useRef, useState } from 'react';
import { checkDocxOpen } from './docx';
import { decodeDocx, encodeDocx } from './docxCodec';
import { wordBridge } from './bridge';
import type { EditorAccess, Tab } from './editorTypes';
import { advanceWordcraftStage, wordcraftBytes, wordcraftMessage, wordcraftTimeoutKind, type WordcraftStage } from './wordcraftProtocol';

type Pending = { resolve: (bytes: string) => void; reject: (reason: Error) => void; timeout: number };
type FailureKind = 'startup' | 'import' | 'compatibility';

export const WordcraftEditor = memo(function WordcraftEditor({ tab, active, language, register, onChange, onFailed, onCompatibilityWarning, onBackstageChange, onOpen, onNew, onCloseAll, onHostSave, onReady }: {
  tab: Tab | null; active: boolean; language: 'EN' | 'VI'; register: (access: EditorAccess | null) => void;
  onChange: () => void; onFailed: (kind: FailureKind, reason: string) => void; onCompatibilityWarning?: (reason: string) => void; onBackstageChange: (backstage: boolean) => void;
  onOpen: () => void; onNew: () => void; onCloseAll: (save: boolean) => void; onHostSave: (bytesBase64: string, saveAs: boolean) => Promise<boolean>; onReady: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const pending = useRef(new Map<string, Pending>());
  const snapshotRev = useRef('');
  const observedRevision = useRef('');
  const openId = useRef('');
  const openingTab = useRef<Tab | null>(null);
  const currentTab = useRef(tab);
  currentTab.current = tab;
  const currentLanguage = useRef(language);
  currentLanguage.current = language;
  const openInFrame = useRef<((tab: Tab) => void) | null>(null);
  const [ready, setReady] = useState(false);
  const [rendererReady, setRendererReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [frameUrl, setFrameUrl] = useState<string>();
  const [startupError, setStartupError] = useState('');
  const [failed, setFailed] = useState(false);
  const latest = useRef({ register, onChange, onFailed, onCompatibilityWarning, onBackstageChange, onOpen, onNew, onCloseAll, onHostSave, onReady });
  latest.current = { register, onChange, onFailed, onCompatibilityWarning, onBackstageChange, onOpen, onNew, onCloseAll, onHostSave, onReady };

  const requestFrame = (type: string, command?: string) => new Promise<string>((resolve, reject) => {
    const target = frame.current?.contentWindow;
    if (!target) { reject(Error('Wordcraft frame is unavailable.')); return; }
    const id = crypto.randomUUID();
    const timeout = window.setTimeout(() => { pending.current.delete(id); reject(Error('Wordcraft did not respond.')); }, 45000);
    pending.current.set(id, { resolve, reject, timeout });
    target.postMessage({ type, id, command }, window.location.origin);
  });

  useEffect(() => {
    const iframe = frame.current;
    if (currentTab.current) latest.current.onBackstageChange(true);
    openId.current = '';
    openingTab.current = null;
    const started = performance.now();
    let stage: WordcraftStage = 'wasm-starting';
    let timer = 0;
    const log = (next: string, details: Record<string, string | number> = {}) => {
      console.info('[Wordcraft lifecycle]', { tabId: currentTab.current?.id ?? 'prewarm', attempt, stage: next, elapsedMs: Math.round(performance.now() - started), ...details });
    };
    const fail = (kind: FailureKind, reason: string) => {
      window.clearTimeout(timer);
      log('failed', { kind, reason: kind === 'startup' ? reason.slice(0, 240) : kind });
      if (kind === 'startup' && attempt === 0) {
        log('retrying');
        setRendererReady(false);
        setFrameUrl(undefined);
        setAttempt(1);
        return;
      }
      if (kind !== 'compatibility') setStartupError(reason);
      setFailed(true);
      latest.current.onFailed(kind, reason);
    };
    const timeout = (ms: number, reason: string) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { log('timeout', { waitingFor: stage }); fail(wordcraftTimeoutKind(stage), reason); }, ms);
    };
    openInFrame.current = nextTab => {
      if (stage !== 'renderer-ready') return;
      openingTab.current = nextTab;
      openId.current = crypto.randomUUID();
      const bytes = nextTab.bytes.slice();
      stage = advanceWordcraftStage(stage, 'open-sent')!;
      log(stage);
      iframe?.contentWindow?.postMessage({ type: 'wordcraft:open', id: openId.current, name: `${nextTab.name.replace(/\.docx$/i, '')}.docx`, bytes: bytes.buffer }, window.location.origin, [bytes.buffer]);
      timeout(45000, 'Wordcraft did not finish opening this document.');
    };
    const onLoad = () => {
      const next = advanceWordcraftStage(stage, 'html-loaded');
      if (!next) return;
      try { if (!iframe?.contentWindow?.location.href.includes('/wordcraft/index.html')) return; } catch { return; }
      stage = next;
      log(stage);
    };
    const receive = (event: MessageEvent) => {
      const data = wordcraftMessage(event, iframe?.contentWindow ?? null, window.location.origin);
      if (!data) return;
      if (data.type === 'wordcraft:ready') {
        const next = advanceWordcraftStage(stage, 'ready');
        if (!next) return;
        window.clearTimeout(timer);
        stage = next;
        log(stage, { backend: typeof data.backend === 'string' ? data.backend : 'unknown' });
        if (typeof data.backend === 'string' && iframe) { iframe.dataset.backend = data.backend; document.documentElement.dataset.wordcraftBackend = data.backend; }
        setRendererReady(true);
      } else if (data.type === 'wordcraft:open-result') {
        if (stage !== 'document-opening' || data.id !== openId.current) return;
        window.clearTimeout(timer);
        if (data.opened !== true) { stage = 'import-failed'; fail('import', typeof data.error === 'string' ? data.error : 'Wordcraft could not open this DOCX.'); return; }
        stage = advanceWordcraftStage(stage, 'opened')!;
        log(stage);
        void requestFrame('wordcraft:snapshot').then(encoded => {
          const openedTab = openingTab.current;
          const error = !openedTab || openedTab.source === 'blank' ? null : checkDocxOpen(openedTab.bytes, decodeDocx(encoded));
          if (error) { latest.current.onCompatibilityWarning?.(error); fail('compatibility', error); }
          else { stage = advanceWordcraftStage(stage, 'checked')!; log(stage); setStartupError(''); setFailed(false); setReady(true); }
        }).catch(error => fail('import', String(error)));
      } else if (data.type === 'wordcraft:view' && typeof data.backstage === 'boolean') {
        latest.current.onBackstageChange(data.backstage);
      } else if (data.type === 'wordcraft:failed') {
        if (stage === 'usable') return;
        const step = typeof data.stage === 'string' ? `${data.stage}: ` : '';
        fail('startup', `${step}${typeof data.error === 'string' ? data.error : 'Wordcraft renderer failed to start.'}`);
      } else if (data.type === 'wordcraft:revision') {
        if (typeof data.rev !== 'string' || data.rev === observedRevision.current) return;
        observedRevision.current = data.rev;
        if (stage === 'usable' && data.dirty === true) latest.current.onChange();
      } else if (data.type === 'wordcraft:snapshot-result') {
        const id = typeof data.id === 'string' ? data.id : '';
        const task = pending.current.get(id);
        if (!task) return;
        pending.current.delete(id);
        window.clearTimeout(task.timeout);
        const bytes = data.bytes;
        if (!wordcraftBytes(bytes)) task.reject(Error('Invalid Wordcraft snapshot.'));
        else { snapshotRev.current = typeof data.rev === 'string' ? data.rev : ''; task.resolve(encodeDocx(bytes)); }
      } else if (data.type === 'wordcraft:command-result') {
        const id = typeof data.id === 'string' ? data.id : '';
        const task = pending.current.get(id);
        if (task) { pending.current.delete(id); window.clearTimeout(task.timeout); data.error ? task.reject(Error(String(data.error))) : task.resolve(''); }
      } else if (data.type === 'wordcraft:print-discover') {
        void Promise.all([wordBridge.printers(), wordBridge.refeedPreferences()])
          .then(([printers, preferences]) => iframe?.contentWindow?.postMessage({
            type: 'wordcraft:print-discover-result',
            dataJson: JSON.stringify({ printers, preferences, language: currentLanguage.current }),
          }, window.location.origin))
          .catch(error => iframe?.contentWindow?.postMessage({
            type: 'wordcraft:print-discover-result',
            dataJson: JSON.stringify({ error: String(error), language: currentLanguage.current }),
          }, window.location.origin));
      } else if (data.type === 'wordcraft:print-properties') {
        if (typeof data.printer !== 'string') return;
        void wordBridge.openPrinterProperties(data.printer)
          .then(() => iframe?.contentWindow?.postMessage({ type: 'wordcraft:print-properties-result', dataJson: '{}' }, window.location.origin))
          .catch(error => iframe?.contentWindow?.postMessage({
            type: 'wordcraft:print-properties-result', dataJson: JSON.stringify({ error: String(error) }),
          }, window.location.origin));
      } else if (data.type === 'wordcraft:print-submit') {
        if (!wordcraftBytes(data.bytes) || data.bytes.byteLength > 100 * 1024 * 1024 || typeof data.paramsJson !== 'string') return;
        let params: Record<string, unknown>;
        try {
          const parsed = JSON.parse(data.paramsJson);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
          params = parsed;
        } catch { return; }
        const printer = typeof params.hostPrinter === 'string' ? params.hostPrinter : '';
        const mode = typeof params.hostDuplex === 'string' ? params.hostDuplex : '';
        const copies = typeof params.hostCopies === 'number' && Number.isInteger(params.hostCopies) ? params.hostCopies : 0;
        const collate = params.collate !== false;
        const pass = params.manualPass === 'front' || params.manualPass === 'back' ? params.manualPass : undefined;
        const face = params.hostFace === 'faceUp' || params.hostFace === 'faceDown' ? params.hostFace : undefined;
        const leadingEdge = params.hostLeadingEdge === 'top' || params.hostLeadingEdge === 'bottom' ? params.hostLeadingEdge : undefined;
        const reply = (value: Record<string, unknown>) => iframe?.contentWindow?.postMessage({
          type: 'wordcraft:print-submit-result', dataJson: JSON.stringify({ ...value, ...(pass ? { pass } : {}) }),
        }, window.location.origin);
        const validMode = pass ? mode === 'manual' : ['printerDefault', 'oneSided', 'longEdge', 'shortEdge'].includes(mode);
        if (!printer || copies < 1 || copies > 999 || !validMode) {
          reply({ error: 'Wordcraft sent invalid printer settings.' });
          return;
        }
        const pdfBase64 = encodeDocx(data.bytes);
        void (async () => {
          if (pass) {
            if (!face || !leadingEdge) throw Error('Wordcraft sent invalid manual duplex settings.');
            if (pass === 'front') await wordBridge.saveRefeedPreference(printer, face, leadingEdge);
            return wordBridge.printManualPass(pdfBase64, printer, pass);
          }
          return wordBridge.printPdf(pdfBase64, printer, mode, copies, collate);
        })().then(receipt => reply({ receipt })).catch(error => reply({ error: String(error) }));
      } else if (data.type === 'wordcraft:save') {
        const bytes = data.bytes;
        const id = typeof data.id === 'string' ? data.id : '';
        if (!/^\d+$/.test(id)) return;
        if (!wordcraftBytes(bytes)) { iframe?.contentWindow?.postMessage({ type: 'wordcraft:save-result', id, error: 'Invalid or oversized Wordcraft document.' }, window.location.origin); return; }
        if (typeof data.name !== 'string' || !/\.docx$/i.test(data.name)) { iframe?.contentWindow?.postMessage({ type: 'wordcraft:save-result', id, error: 'B6H stores Word documents as DOCX.' }, window.location.origin); return; }
        void latest.current.onHostSave(encodeDocx(bytes), data.saveAs === true).then(ok => {
          iframe?.contentWindow?.postMessage({ type: 'wordcraft:save-result', id, ...(ok ? {} : { error: 'B6H could not save the document.' }) }, window.location.origin);
        }).catch(error => iframe?.contentWindow?.postMessage({ type: 'wordcraft:save-result', id, error: String(error) }, window.location.origin));
      } else if (data.type === 'wordcraft:new') latest.current.onNew();
      else if (data.type === 'wordcraft:open-request') latest.current.onOpen();
      else if (data.type === 'wordcraft:close-all-save') latest.current.onCloseAll(true);
      else if (data.type === 'wordcraft:close-all-discard') latest.current.onCloseAll(false);
    };
    window.addEventListener('message', receive);
    iframe?.addEventListener('load', onLoad);
    log(stage);
    timeout(90000, 'Wordcraft did not start within 90 seconds.');
    setFrameUrl(`./wordcraft/index.html?host=parent&v=${Date.now()}`);
    return () => {
      window.clearTimeout(timer);
      openInFrame.current = null;
      window.removeEventListener('message', receive);
      iframe?.removeEventListener('load', onLoad);
      for (const task of pending.current.values()) { window.clearTimeout(task.timeout); task.reject(Error('Wordcraft closed.')); }
      pending.current.clear();
    };
  }, [attempt]);

  useEffect(() => {
    if (!rendererReady || !tab || openId.current) return;
    latest.current.onBackstageChange(true);
    openInFrame.current?.(tab);
  }, [rendererReady, tab?.id]);

  useEffect(() => {
    if (!ready || !tab) return;
    latest.current.register({ save: () => requestFrame('wordcraft:snapshot'), print: async () => { await requestFrame('wordcraft:command', 'print'); }, snapshotRevision: () => snapshotRev.current, confirmSaved: (name, revision) => {
      if (revision) frame.current?.contentWindow?.postMessage({ type: 'wordcraft:stored', rev: revision, name: `${name.replace(/\.docx$/i, '')}.docx` }, window.location.origin);
    } });
    latest.current.onReady();
    return () => latest.current.register(null);
  }, [ready, tab?.id]);

  return <div className={`word-editor wordcraft-editor${ready ? ' is-ready' : ''}`} hidden={!active}>
    <iframe key={attempt} ref={frame} src={frameUrl} title={`${language === 'VI' ? 'Trình soạn thảo Wordcraft' : 'Wordcraft editor'}: ${tab?.name ?? 'prewarm'}`} allow="clipboard-read; clipboard-write" />
    {!ready && (!failed || startupError) && <p role="status">{!failed && (language === 'VI' ? 'Đang tải Wordcraft…' : 'Loading Wordcraft…')}{startupError && <button type="button" onClick={() => { setFailed(false); setStartupError(''); setRendererReady(false); setFrameUrl(undefined); setAttempt(value => value + 1); }}>{language === 'VI' ? 'Thử lại' : 'Retry Wordcraft'}</button>}</p>}
  </div>;
});
