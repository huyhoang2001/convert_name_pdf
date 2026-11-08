import { useEffect, useRef, useState, type PointerEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { answerQuestion, blockedQuestion, relevantFaqIds } from './chatbotEngine';
import { faqs, type ChatLanguage } from './chatbotFaq';
import { chatSize, clampChat, launcherAt, type Point } from './chatDock';
import { formatChatText } from './chatText';
import { acceptChatQuestion, emptyChatSession, isChatSession, onlineChatHistory, restoreChatSession, settleChatReply, type ChatContext, type ChatMessage, type ChatSession } from './chatbotSession';

function useChatDrag() {
  const [position, setPosition] = useState<Point>(() => {
    const size = chatSize(window.innerWidth, window.innerHeight);
    return clampChat({ x: window.innerWidth - size.width - 12, y: window.innerHeight - size.height - 82 }, window.innerWidth, window.innerHeight);
  });
  const start = useRef<{ pointer: number; x: number; y: number; left: number; top: number } | null>(null);
  const moved = useRef(false);
  useEffect(() => {
    const resize = () => setPosition(point => clampChat(point, window.innerWidth, window.innerHeight));
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const down = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, input, textarea') && event.currentTarget !== event.target) return;
    start.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: position.x, top: position.y };
    moved.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    if (!start.current || event.pointerId !== start.current.pointer) return;
    const dx = event.clientX - start.current.x, dy = event.clientY - start.current.y;
    if (Math.hypot(dx, dy) > 4) moved.current = true;
    if (moved.current) setPosition(clampChat({ x: start.current.left + dx, y: start.current.top + dy }, window.innerWidth, window.innerHeight));
  };
  const up = (event: PointerEvent<HTMLElement>) => { if (start.current?.pointer === event.pointerId) start.current = null; };
  return { position, moved, down, move, up };
}

type Diagnostic = { context: ChatContext; at: number };
export default function HelpChatbot({ language, keyConfigured, selector }: { language: ChatLanguage; keyConfigured: boolean | null; selector: string }) {
  const [open, setOpen] = useState(false), [input, setInput] = useState('');
  const [session, setSession] = useState<ChatSession>(() => emptyChatSession());
  const [mode, setMode] = useState<'offline' | 'online'>('offline');
  const [onlineAvailable, setOnlineAvailable] = useState(false), [onlineStatusError, setOnlineStatusError] = useState(false);
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [canWrite, setCanWrite] = useState(false), [chatError, setChatError] = useState('');
  const drag = useChatDrag(), launcherPosition = launcherAt(drag.position, window.innerWidth, window.innerHeight);
  const launcherRef = useRef<HTMLButtonElement>(null), panelRef = useRef<HTMLElement>(null), inputRef = useRef<HTMLInputElement>(null), endRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef(session), busyRef = useRef(false), epoch = useRef(0), writeQueue = useRef<Promise<void>>(Promise.resolve()), diagnostic = useRef<Diagnostic | null>(null), activeRequest = useRef<{ id: string; mode: ChatMessage['mode'] } | null>(null);
  const updateSession = (value: ChatSession) => { sessionRef.current = value; setSession(value); };
  const queueWrite = (write: () => Promise<void>) => {
    const next = writeQueue.current.catch(() => undefined).then(write);
    writeQueue.current = next;
    return next;
  };
  const persist = (value: ChatSession, expectedEpoch: number) => queueWrite(async () => {
    if (epoch.current === expectedEpoch) await window.pdfApp.saveChatSession(value);
  });

  useEffect(() => {
    let mounted = true;
    void window.pdfApp.loadChatSession().then(value => {
      if (!mounted) return;
      if (value === null) { setCanWrite(true); setReady(true); return; }
      if (!isChatSession(value)) throw new Error('Saved chatbot session is invalid. Reset the chatbot to continue.');
      const restored = restoreChatSession(value);
      updateSession(restored);
      setCanWrite(true);
      setReady(true);
      if (restored.messages.some(message => message.status === 'interrupted')) void persist(restored, epoch.current).catch(error => setChatError(safeError(error)));
    }).catch(error => { if (mounted) { setChatError(safeError(error)); setReady(true); } });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    const onContext = (event: Event) => {
      const detail = (event as CustomEvent<ChatContext>).detail;
      if (!detail || typeof detail.selector !== 'string') return;
      diagnostic.current = { context: { selector: detail.selector, ...(typeof detail.fieldId === 'string' ? { fieldId: detail.fieldId } : {}), ...(typeof detail.validationCode === 'string' ? { validationCode: detail.validationCode } : {}), ...(typeof detail.errorCode === 'string' ? { errorCode: detail.errorCode } : {}) }, at: Date.now() };
    };
    window.addEventListener('b6h-chat-context', onContext);
    return () => window.removeEventListener('b6h-chat-context', onContext);
  }, []);
  useEffect(() => {
    let active = true;
    if (keyConfigured !== null) {
      setOnlineAvailable(keyConfigured); setOnlineStatusError(false);
      if (!keyConfigured) setMode('offline');
      return () => { active = false; };
    }
    window.pdfApp.getChatOnlineStatus().then(available => {
      if (!active) return;
      setOnlineAvailable(available); setOnlineStatusError(false);
      if (!available) setMode('offline');
    }).catch(() => { if (active) { setOnlineAvailable(false); setOnlineStatusError(true); setMode('offline'); } });
    return () => { active = false; };
  }, [keyConfigured, open]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { if (open) endRef.current?.scrollIntoView({ block: 'end' }); }, [session.messages, open]);
  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !launcherRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
  }, [open]);

  const labels = language === 'VI'
    ? { title: 'Trợ giúp B6H', subtitle: 'Hỏi về cách dùng ứng dụng', open: 'Mở trợ giúp', close: 'Đóng trợ giúp', reset: 'Đặt lại chatbot', greeting: 'Xin chào! Tôi có thể hướng dẫn bạn dùng B6H.', placeholder: 'Nhập câu hỏi...', send: 'Gửi', drag: 'Kéo để di chuyển', resetPrompt: 'Đặt lại chatbot? Thao tác này xóa lịch sử trò chuyện đã lưu và không thể hoàn tác. Dữ liệu B6H khác không bị thay đổi.', resetAtLimit: 'Bạn đã dùng hết 20 câu hỏi. Đặt lại chatbot sẽ xóa lịch sử này và không thể khôi phục.', sessionInfo: 'Lịch sử được lưu trên thiết bị này cho đến khi bạn đặt lại chatbot.', limit: 'câu hỏi', storageError: 'Không thể lưu hoặc đọc phiên chatbot. Hãy thử lại; câu hỏi chưa gửi khi chưa lưu thành công.', full: 'Đã đạt giới hạn 20 câu hỏi. Hãy đặt lại chatbot để tiếp tục.', interrupted: 'Phản hồi này đã bị gián đoạn khi B6H đóng. Không gửi lại tự động.' }
    : { title: 'B6H Help', subtitle: 'Ask how to use the app', open: 'Open help', close: 'Close help', reset: 'Reset chatbot', greeting: 'Hello! I can guide you through B6H.', placeholder: 'Type a question...', send: 'Send', drag: 'Drag to move', resetPrompt: 'Reset the chatbot? This deletes the saved conversation and cannot be undone. Other B6H data will not change.', resetAtLimit: 'You have used all 20 questions. Resetting the chatbot deletes this history and cannot be undone.', sessionInfo: 'Chat history is saved on this device until you reset the chatbot.', limit: 'questions', storageError: 'Could not read or save the chatbot session. Try again; an unsaved question was not sent.', full: 'The 20-question limit is reached. Reset the chatbot to continue.', interrupted: 'This reply was interrupted when B6H closed. It was not sent again.' };
  const modeLabels = language === 'VI'
    ? { offline: 'Ngoại tuyến', online: 'Trực tuyến', sending: 'Đang gửi...', offlineHint: 'Câu trả lời có sẵn trên thiết bị.', onlineHint: 'Tin nhắn được gửi tới OpenRouter; không gửi tệp.', noKey: 'Thêm khóa OpenRouter trong Cài đặt.', statusError: 'Không thể kiểm tra khóa đã lưu. Hãy lưu lại khóa trong Cài đặt.' }
    : { offline: 'Offline', online: 'Online', sending: 'Sending...', offlineHint: 'Built-in answers on this device.', onlineHint: 'Messages go to OpenRouter; files are not sent.', noKey: 'Add an OpenRouter key in Settings.', statusError: 'Could not check the saved key. Save it again in Settings.' };

  const send = async (question: string) => {
    if (busyRef.current || !ready || !canWrite) return;
    const trimmed = question.trim();
    if (!trimmed) return;
    if (sessionRef.current.userQuestionCount >= 20) { setChatError(labels.full); return; }
    busyRef.current = true; setBusy(true); setChatError('');
    const currentEpoch = epoch.current;
    const recent = diagnostic.current && Date.now() - diagnostic.current.at < 60_000 ? diagnostic.current.context : undefined;
    const previousFaqId = [...sessionRef.current.messages].reverse().find(message => message.role === 'user')?.context?.faqIds?.[0];
    const context: ChatContext = { selector, ...(recent?.selector === selector ? { fieldId: recent.fieldId, validationCode: recent.validationCode, errorCode: recent.errorCode } : {}), ...(previousFaqId ? { previousFaqId } : {}) };
    const faqIds = relevantFaqIds(trimmed, context);
    if (faqIds.length) context.faqIds = faqIds;
    const accepted = acceptChatQuestion(sessionRef.current, trimmed, mode, context);
    if (!accepted) { busyRef.current = false; setBusy(false); return; }
    try { await persist(accepted.session, currentEpoch); }
    catch (error) { busyRef.current = false; setBusy(false); setChatError(`${labels.storageError} ${safeError(error)}`); return; }
    if (epoch.current !== currentEpoch) { busyRef.current = false; setBusy(false); return; }
    updateSession(accepted.session); setInput(''); activeRequest.current = { id: accepted.requestId, mode };
    const finish = async (text: string, status: 'complete' | 'error' = 'complete') => {
      if (epoch.current !== currentEpoch) return;
      const settled = settleChatReply(sessionRef.current, accepted.requestId, text, status);
      updateSession(settled);
      try { await persist(settled, currentEpoch); }
      catch (error) { setChatError(`${labels.storageError} ${safeError(error)}`); }
    };
    if (blockedQuestion(trimmed)) {
      await finish(language === 'VI' ? 'Tôi chỉ hỗ trợ cách dùng B6H; không cung cấp mã hoặc hướng dẫn vượt quy tắc.' : 'I can help with B6H, but cannot provide code or instructions to bypass the rules.');
    } else if (mode === 'offline') {
      await finish(answerQuestion(trimmed, language, context).answer);
    } else {
      let lastRender = 0;
      const history = onlineChatHistory(accepted.session, trimmed);
      if (!history) {
        const fallback = answerQuestion(trimmed, language, context).answer;
        await finish(`${language === 'VI' ? 'Câu hỏi quá dài cho yêu cầu trực tuyến. Trả lời ngoại tuyến: ' : 'The question is too long for the online request. Offline answer: '}${fallback}`, 'error');
      } else try {
        const answer = await window.pdfApp.askOnlineChat([...history, { role: 'user', content: trimmed }], language, text => {
          if (epoch.current !== currentEpoch || Date.now() - lastRender < 100) return;
          lastRender = Date.now();
          updateSession(settleChatReply(sessionRef.current, accepted.requestId, formatChatText(text), 'pending'));
        }, context, accepted.requestId);
        await finish(formatChatText(answer));
      } catch (reason) {
        if (epoch.current === currentEpoch) {
          const fallback = answerQuestion(trimmed, language, context).answer;
          const detail = safeError(reason);
          await finish(`${language === 'VI' ? `Lỗi trực tuyến: ${detail}. Trả lời ngoại tuyến: ` : `Online error: ${detail}. Offline answer: `}${fallback}`, 'error');
        }
      }
    }
    if (activeRequest.current?.id === accepted.requestId) activeRequest.current = null;
    if (epoch.current === currentEpoch) { busyRef.current = false; setBusy(false); }
  };

  const reset = async () => {
    if (!ready) return;
    if ((sessionRef.current.messages.length || chatError) && !window.confirm(sessionRef.current.userQuestionCount >= 20 ? labels.resetAtLimit : labels.resetPrompt)) return;
    const oldRequest = activeRequest.current;
    const oldEpoch = epoch.current++;
    if (oldRequest?.mode === 'online') void window.pdfApp.cancelOnlineChat(oldRequest.id).catch(() => undefined);
    activeRequest.current = null;
    busyRef.current = false; setBusy(false); setChatError(''); setInput('');
    try {
      await queueWrite(async () => { await window.pdfApp.resetChatSession(); });
      if (epoch.current > oldEpoch) { updateSession(emptyChatSession()); setCanWrite(true); }
    } catch (error) { setChatError(`${labels.storageError} ${safeError(error)}`); }
  };

  const displayMessage = (message: ChatMessage) => message.status === 'interrupted' ? labels.interrupted : message.status === 'pending' && !message.text ? modeLabels.sending : message.text;
  return <>
    <button ref={launcherRef} type="button" className="chat-launcher" style={{ left: launcherPosition.x, top: launcherPosition.y }} aria-label={open ? labels.close : labels.open} aria-expanded={open} aria-controls="help-chat-panel" title={`${open ? labels.close : labels.open} · ${labels.drag}`} onPointerDown={drag.down} onPointerMove={drag.move} onPointerUp={drag.up} onClick={() => { if (drag.moved.current) { drag.moved.current = false; return; } setOpen(value => !value); }}><img src="./chatbot.ico" alt="" /></button>
    {open && <section ref={panelRef} id="help-chat-panel" className="chat-panel" style={{ left: drag.position.x, top: drag.position.y }} role="dialog" aria-label={labels.title}>
      <header className="chat-header" title={labels.drag} onPointerDown={drag.down} onPointerMove={drag.move} onPointerUp={drag.up}>
        <div><strong>{labels.title}</strong><span>{labels.subtitle}</span></div><div className="chat-header-actions"><button type="button" onClick={() => void reset()} aria-label={labels.reset} title={labels.reset}>↻</button><button type="button" onClick={() => setOpen(false)} aria-label={labels.close} title={labels.close}>×</button></div>
      </header>
      <div className="chat-mode"><div role="group" aria-label={language === 'VI' ? 'Chế độ trợ giúp' : 'Help mode'}><button type="button" aria-pressed={mode === 'offline'} disabled={busy} onClick={() => setMode('offline')}>{modeLabels.offline}</button><button type="button" aria-pressed={mode === 'online'} disabled={busy || !onlineAvailable} onClick={() => setMode('online')} title={onlineAvailable ? modeLabels.onlineHint : onlineStatusError ? modeLabels.statusError : modeLabels.noKey}>{modeLabels.online}</button></div><small>{mode === 'online' ? modeLabels.onlineHint : onlineStatusError ? modeLabels.statusError : onlineAvailable ? modeLabels.offlineHint : modeLabels.noKey}</small></div>
      <div className="chat-session-info"><span>{session.userQuestionCount}/20 {labels.limit}</span><small>{session.userQuestionCount >= 20 ? labels.full : labels.sessionInfo}</small></div>
      <div className="chat-messages" role="log" aria-live="polite" aria-relevant="additions text">
        {session.messages.length === 0 && <div className="chat-greeting"><img src="./chatbot.ico" alt="" /><p>{labels.greeting}</p></div>}
        {session.messages.map(message => message.role === 'assistant' ? <div key={message.id} className="chat-message assistant"><ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={{ table: ({ node: _node, ...props }) => <div className="chat-table-scroll"><table {...props} /></div> }}>{displayMessage(message)}</ReactMarkdown></div> : <p key={message.id} className="chat-message user">{message.text}</p>)}<div ref={endRef} />
      </div>
      {chatError && <p className="chat-error" role="alert">{chatError}</p>}
      <div className="chat-suggestions">{faqs.filter(faq => ['rename', 'count', 'word-multiple-files', 'settings'].includes(faq.id)).map(faq => <button key={faq.id} type="button" disabled={busy || !ready || !canWrite || session.userQuestionCount >= 20} onClick={() => void send(faq.prompts[language])}>{faq.prompts[language]}</button>)}</div>
      <form className="chat-compose" onSubmit={event => { event.preventDefault(); void send(input); }}><input ref={inputRef} value={input} maxLength={1000} onChange={event => setInput(event.target.value)} placeholder={labels.placeholder} aria-label={labels.placeholder} disabled={busy || !ready || !canWrite || session.userQuestionCount >= 20} /><button className="primary-button" type="submit" disabled={!input.trim() || busy || !ready || !canWrite || session.userQuestionCount >= 20}>{busy ? modeLabels.sending : labels.send}</button></form>
    </section>}
  </>;
}

function safeError(reason: unknown) {
  return String(reason).replace(/^Error: /, '').replace(/sk-or-v1-[A-Za-z0-9]+/g, '[redacted]').replace(/([A-Za-z]:\\[^\s,;]+)/g, '[path]').replace(/[\r\n]+/g, ' ').slice(0, 180);
}
