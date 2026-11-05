import { memo, useEffect, useRef, useState } from 'react';
import { checkDocxOpen, decodeDocx, encodeDocx } from './docx';
import type { EditorAccess, Tab } from './editorTypes';
import { advanceWordcraftStage, wordcraftBytes, wordcraftMessage, wordcraftTimeoutKind, type WordcraftStage } from './wordcraftProtocol';

type Pending = { resolve: (bytes: string) => void; reject: (reason: Error) => void; timeout: number };
type FailureKind = 'startup' | 'import' | 'compatibility';

export const WordcraftEditor = memo(function WordcraftEditor({ tab, active, language, register, onChange, onFailed, onCompatibilityWarning, onOpen, onNew, onHostSave, onReady }: {
  tab: Tab; active: boolean; language: 'EN' | 'VI'; register: (access: EditorAccess | null) => void;
  onChange: () => void; onFailed: (kind: FailureKind, reason: string) => void; onCompatibilityWarning?: (reason: string) => void;
  onOpen: () => void; onNew: () => void; onHostSave: (bytesBase64: string, saveAs: boolean) => Promise<boolean>; onReady: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const pending = useRef(new Map<string, Pending>());
  const snapshotRev = useRef('');
  const observedRevision = useRef('');
  const openId = useRef('');
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [frameUrl, setFrameUrl] = useState<string>();
  const [startupError, setStartupError] = useState('');
  const [failed, setFailed] = useState(false);
  const latest = useRef({ register, onChange, onFailed, onCompatibilityWarning, onOpen, onNew, onHostSave, onReady });
  latest.current = { register, onChange, onFailed, onCompatibilityWarning, onOpen, onNew, onHostSave, onReady };

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
    const started = performance.now();
    let stage: WordcraftStage = 'wasm-starting';
    let timer = 0;
    const log = (next: string, details: Record<string, string | number> = {}) => {
      console.info('[Wordcraft lifecycle]', { tabId: tab.id, attempt, stage: next, elapsedMs: Math.round(performance.now() - started), ...details });
    };
    const fail = (kind: FailureKind, reason: string) => {
      window.clearTimeout(timer);
      log('failed', { kind, reason: kind === 'startup' ? reason.slice(0, 240) : kind });
      if (kind === 'startup' && attempt === 0) {
        log('retrying');
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
        openId.current = crypto.randomUUID();
        const bytes = tab.bytes.slice();
        stage = advanceWordcraftStage(stage, 'open-sent')!;
        log(stage);
        iframe?.contentWindow?.postMessage({ type: 'wordcraft:open', id: openId.current, name: `${tab.name.replace(/\.docx$/i, '')}.docx`, bytes: bytes.buffer }, window.location.origin, [bytes.buffer]);
        timeout(45000, 'Wordcraft did not finish opening this document.');
      } else if (data.type === 'wordcraft:open-result') {
        if (stage !== 'document-opening' || data.id !== openId.current) return;
        window.clearTimeout(timer);
        if (data.opened !== true) { stage = 'import-failed'; fail('import', typeof data.error === 'string' ? data.error : 'Wordcraft could not open this DOCX.'); return; }
        stage = advanceWordcraftStage(stage, 'opened')!;
        log(stage);
        void requestFrame('wordcraft:snapshot').then(encoded => {
          const error = tab.source === 'blank' ? null : checkDocxOpen(tab.bytes, decodeDocx(encoded));
          if (error) { latest.current.onCompatibilityWarning?.(error); fail('compatibility', error); }
          else { stage = advanceWordcraftStage(stage, 'checked')!; log(stage); setStartupError(''); setFailed(false); setReady(true); }
        }).catch(error => fail('import', String(error)));
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
    };
    window.addEventListener('message', receive);
    iframe?.addEventListener('load', onLoad);
    log(stage);
    timeout(90000, 'Wordcraft did not start within 90 seconds.');
    setFrameUrl('./wordcraft/index.html?host=parent');
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('message', receive);
      iframe?.removeEventListener('load', onLoad);
      for (const task of pending.current.values()) { window.clearTimeout(task.timeout); task.reject(Error('Wordcraft closed.')); }
      pending.current.clear();
    };
  }, [attempt, tab.id]);

  useEffect(() => {
    if (!ready) return;
    latest.current.register({ save: () => requestFrame('wordcraft:snapshot'), print: async () => { await requestFrame('wordcraft:command', 'print'); }, snapshotRevision: () => snapshotRev.current, confirmSaved: (name, revision) => {
      if (revision) frame.current?.contentWindow?.postMessage({ type: 'wordcraft:stored', rev: revision, name: `${name.replace(/\.docx$/i, '')}.docx` }, window.location.origin);
    } });
    latest.current.onReady();
    return () => latest.current.register(null);
  }, [ready]);

  return <div className={`word-editor wordcraft-editor${ready ? ' is-ready' : ''}`} hidden={!active}>
    <iframe key={attempt} ref={frame} src={frameUrl} title={`${language === 'VI' ? 'Trình soạn thảo Wordcraft' : 'Wordcraft editor'}: ${tab.name}`} allow="clipboard-read; clipboard-write" />
    {!ready && (!failed || startupError) && <p role="status">{!failed && (language === 'VI' ? 'Đang tải Wordcraft…' : 'Loading Wordcraft…')}{startupError && <button type="button" onClick={() => { setFailed(false); setStartupError(''); setFrameUrl(undefined); setAttempt(value => value + 1); }}>{language === 'VI' ? 'Thử lại' : 'Retry Wordcraft'}</button>}</p>}
  </div>;
});
