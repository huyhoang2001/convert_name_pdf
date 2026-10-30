import { useEffect, useRef, useState, type PointerEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { answerQuestion, blockedQuestion } from './chatbotEngine';
import { faqs, type ChatLanguage } from './chatbotFaq';
import { chatSize, clampChat, launcherAt, type Point } from './chatDock';
import { formatChatText } from './chatText';

type Message = { role: 'user' | 'assistant'; text: string; online?: boolean };
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

export default function HelpChatbot({ language, keyRevision }: { language: ChatLanguage; keyRevision: number }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState<'offline' | 'online'>('offline');
  const [onlineAvailable, setOnlineAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const drag = useChatDrag();
  const launcherPosition = launcherAt(drag.position, window.innerWidth, window.innerHeight);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { window.pdfApp.getChatOnlineStatus().then(available => { setOnlineAvailable(available); if (!available) setMode('offline'); }).catch(() => { setOnlineAvailable(false); setMode('offline'); }); }, [keyRevision]);
  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !launcherRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
  }, [open]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);
  const send = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    const previous = messages.filter(message => message.online).slice(-4).map(message => ({ role: message.role, content: message.text.slice(0, 600) }));
    setMessages(current => [...current, { role: 'user', text: trimmed, online: mode === 'online' && !blockedQuestion(trimmed) }]);
    setInput('');
    if (blockedQuestion(trimmed)) {
      setMessages(current => [...current, { role: 'assistant', text: language === 'VI' ? 'Tôi chỉ hỗ trợ cách dùng B6H; không cung cấp mã hoặc hướng dẫn vượt quy tắc.' : 'I can help with B6H, but cannot provide code or instructions to bypass the rules.' }]);
      return;
    }
    if (mode === 'offline') {
      setMessages(current => [...current, { role: 'assistant', text: answerQuestion(trimmed, language).answer }]);
      return;
    }
    setBusy(true);
    setMessages(current => [...current, { role: 'assistant', text: '', online: true }]);
    try {
      const answer = await window.pdfApp.askOnlineChat([...previous, { role: 'user', content: trimmed }], language, text => {
        setMessages(current => [...current.slice(0, -1), { role: 'assistant', text: formatChatText(text), online: true }]);
      });
      setMessages(current => [...current.slice(0, -1), { role: 'assistant', text: formatChatText(answer), online: true }]);
    } catch {
      const fallback = answerQuestion(trimmed, language).answer;
      setMessages(current => [...current.slice(0, -2), { ...current.at(-2)!, online: false }, { role: 'assistant', text: `${language === 'VI' ? 'Trợ giúp trực tuyến không khả dụng. Câu trả lời ngoại tuyến: ' : 'Online help is unavailable. Offline answer: '}${fallback}` }]);
    } finally { setBusy(false); }
  };
  const labels = language === 'VI' ? { title: 'Trợ giúp B6H', subtitle: 'Hỏi về cách dùng ứng dụng', open: 'Mở trợ giúp', close: 'Đóng trợ giúp', newChat: 'Cuộc trò chuyện mới', greeting: 'Xin chào! Tôi có thể hướng dẫn bạn dùng B6H.', placeholder: 'Nhập câu hỏi...', send: 'Gửi', drag: 'Kéo để di chuyển' } : { title: 'B6H Help', subtitle: 'Ask how to use the app', open: 'Open help', close: 'Close help', newChat: 'New chat', greeting: 'Hello! I can guide you through B6H.', placeholder: 'Type a question...', send: 'Send', drag: 'Drag to move' };
  const modeLabels = language === 'VI' ? { offline: 'Ngoại tuyến', online: 'Trực tuyến', sending: 'Đang gửi...', offlineHint: 'Câu trả lời có sẵn trên thiết bị.', onlineHint: 'Tin nhắn được gửi tới OpenRouter; không gửi tệp.', noKey: 'Cần khóa OpenRouter trong .env.' } : { offline: 'Offline', online: 'Online', sending: 'Sending...', offlineHint: 'Built-in answers on this device.', onlineHint: 'Messages go to OpenRouter; files do not.', noKey: 'Add an OpenRouter key to .env.' };
  return <>
    <button ref={launcherRef} type="button" className="chat-launcher" style={{ left: launcherPosition.x, top: launcherPosition.y }} aria-label={open ? labels.close : labels.open} aria-expanded={open} aria-controls="help-chat-panel" title={`${open ? labels.close : labels.open} · ${labels.drag}`} onPointerDown={drag.down} onPointerMove={drag.move} onPointerUp={drag.up} onClick={() => { if (drag.moved.current) { drag.moved.current = false; return; } setOpen(value => !value); }}><img src="./chatbot.ico" alt="" /></button>
    {open && <section ref={panelRef} id="help-chat-panel" className="chat-panel" style={{ left: drag.position.x, top: drag.position.y }} role="dialog" aria-label={labels.title}>
      <header className="chat-header" title={labels.drag} onPointerDown={drag.down} onPointerMove={drag.move} onPointerUp={drag.up}>
        <div><strong>{labels.title}</strong><span>{labels.subtitle}</span></div><div className="chat-header-actions"><button type="button" disabled={busy} onClick={() => { setMessages([]); setInput(''); inputRef.current?.focus(); }} aria-label={labels.newChat} title={labels.newChat}>↺</button><button type="button" onClick={() => setOpen(false)} aria-label={labels.close} title={labels.close}>×</button></div>
      </header>
      <div className="chat-mode"><div role="group" aria-label={language === 'VI' ? 'Chế độ trợ giúp' : 'Help mode'}><button type="button" aria-pressed={mode === 'offline'} disabled={busy} onClick={() => setMode('offline')}>{modeLabels.offline}</button><button type="button" aria-pressed={mode === 'online'} disabled={busy || !onlineAvailable} onClick={() => setMode('online')} title={onlineAvailable ? modeLabels.onlineHint : modeLabels.noKey}>{modeLabels.online}</button></div><small>{mode === 'online' ? modeLabels.onlineHint : onlineAvailable ? modeLabels.offlineHint : modeLabels.noKey}</small></div>
      <div className="chat-messages" role="log" aria-live="polite" aria-relevant="additions text">
        {messages.length === 0 && <div className="chat-greeting"><img src="./chatbot.ico" alt="" /><p>{labels.greeting}</p></div>}
        {messages.map((message, index) => message.role === 'assistant' ? <div key={index} className="chat-message assistant"><ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={{ table: ({ node: _node, ...props }) => <div className="chat-table-scroll"><table {...props} /></div> }}>{message.text}</ReactMarkdown></div> : <p key={index} className="chat-message user">{message.text}</p>)}<div ref={endRef} />
      </div>
      <div className="chat-suggestions">{faqs.slice(0, 4).map(faq => <button key={faq.id} type="button" disabled={busy} onClick={() => void send(faq.prompts[language])}>{faq.prompts[language]}</button>)}</div>
      <form className="chat-compose" onSubmit={event => { event.preventDefault(); void send(input); }}><input ref={inputRef} value={input} maxLength={1000} onChange={event => setInput(event.target.value)} placeholder={labels.placeholder} aria-label={labels.placeholder} disabled={busy} /><button className="primary-button" type="submit" disabled={!input.trim() || busy}>{busy ? modeLabels.sending : labels.send}</button></form>
    </section>}
  </>;
}
