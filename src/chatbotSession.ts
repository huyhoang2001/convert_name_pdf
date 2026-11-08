export const CHAT_QUESTION_LIMIT = 20;
export const CHAT_SESSION_SCHEMA = 1;

export type ChatContext = { selector: string; fieldId?: string; validationCode?: string; errorCode?: string; faqIds?: string[]; previousFaqId?: string };
export type ChatMessage = {
  id: string;
  requestId?: string;
  role: 'user' | 'assistant';
  mode: 'offline' | 'online';
  text: string;
  status: 'accepted' | 'pending' | 'complete' | 'error' | 'interrupted';
  createdAt: number;
  context?: ChatContext;
};
export type ChatSession = {
  schemaVersion: 1;
  sessionId: string;
  userQuestionCount: number;
  messages: ChatMessage[];
};

export function emptyChatSession(): ChatSession {
  return { schemaVersion: CHAT_SESSION_SCHEMA, sessionId: crypto.randomUUID(), userQuestionCount: 0, messages: [] };
}

export function classifyChatError(reason: unknown) {
  const message = String(reason).toLowerCase();
  if (/ep(e|r)m|eacces|ebusy|access denied|permission|workbook could not be (replaced|saved)/.test(message)) return 'access_error';
  if (/enoent|not found|not be found|does not exist/.test(message)) return 'file_not_found';
  if (/workbook|excel|xlsx/.test(message) && /invalid|corrupt|parse|readable|could not be read|unreadable/.test(message)) return 'workbook_format_error';
  if (/ipc|invoke|command failed/.test(message)) return 'ipc_error';
  if (/timeout|network|internet|openrouter/.test(message)) return 'online_error';
  if (/invalid|required|must be|unique|validation/.test(message)) return 'validation_error';
  return 'operation_error';
}

export function isChatSession(value: unknown): value is ChatSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as ChatSession;
  const valid = session.schemaVersion === CHAT_SESSION_SCHEMA && typeof session.sessionId === 'string' &&
    Number.isInteger(session.userQuestionCount) && session.userQuestionCount >= 0 && session.userQuestionCount <= CHAT_QUESTION_LIMIT &&
    Array.isArray(session.messages) && session.messages.length <= CHAT_QUESTION_LIMIT * 2 &&
    session.messages.every(message => message && typeof message.id === 'string' &&
      ['user', 'assistant'].includes(message.role) && ['offline', 'online'].includes(message.mode) &&
      typeof message.text === 'string' && message.text.length <= (message.role === 'user' ? 1000 : 32000) &&
      ['accepted', 'pending', 'complete', 'error', 'interrupted'].includes(message.status) && Number.isFinite(message.createdAt) &&
      (message.requestId === undefined || typeof message.requestId === 'string')) &&
    session.messages.filter(message => message.role === 'user').length === session.userQuestionCount;
  const faqIds = ['rename', 'scan', 'count', 'merge', 'backup', 'translation', 'signature', 'copies', 'settings', 'privacy', 'word-recent', 'word-shortcuts', 'word-multiple-files', 'word-documents', 'features'];
  return valid && session.messages.every(message => !message.context || (
    ['home', 'rename', 'count', 'translation', 'signature', 'copies', 'word', 'settings'].includes(message.context.selector) &&
    (!message.context.fieldId || ['refNo', 'quantity', 'unitPrice', 'totalAmount', 'customer', 'description'].includes(message.context.fieldId)) &&
    (!message.context.validationCode || ['copiesNumbersInvalid', 'browser-invalid', 'signatureHeaderInvalid'].includes(message.context.validationCode)) &&
    (!message.context.errorCode || ['access_error', 'file_not_found', 'workbook_format_error', 'ipc_error', 'online_error', 'validation_error', 'operation_error'].includes(message.context.errorCode)) &&
    (!message.context.previousFaqId || faqIds.includes(message.context.previousFaqId)) &&
    (!message.context.faqIds || Array.isArray(message.context.faqIds) && message.context.faqIds.length <= 3 && message.context.faqIds.every(id => faqIds.includes(id)))
  ));
}

export function restoreChatSession(session: ChatSession): ChatSession {
  return { ...session, messages: session.messages.map(message => message.status === 'pending'
    ? { ...message, status: 'interrupted', text: 'This reply was interrupted when B6H closed. It was not sent again.' }
    : message) };
}

export function acceptChatQuestion(session: ChatSession, question: string, mode: ChatMessage['mode'], context?: ChatContext) {
  const text = question.trim();
  if (!text || text.length > 1000 || session.userQuestionCount >= CHAT_QUESTION_LIMIT) return null;
  const requestId = crypto.randomUUID();
  const now = Date.now();
  const messages: ChatMessage[] = [...session.messages,
    { id: crypto.randomUUID(), requestId, role: 'user', mode, text, status: 'accepted', createdAt: now, ...(context ? { context } : {}) },
    { id: crypto.randomUUID(), requestId, role: 'assistant', mode, text: '', status: 'pending', createdAt: now },
  ];
  return { requestId, session: { ...session, userQuestionCount: session.userQuestionCount + 1, messages } };
}

export function settleChatReply(session: ChatSession, requestId: string, text: string, status: 'pending' | 'complete' | 'error' = 'complete') {
  return { ...session, messages: session.messages.map(message => message.requestId === requestId && message.role === 'assistant'
    ? { ...message, text: text.slice(0, 32000), status }
    : message) };
}

export function onlineChatHistory(session: ChatSession, question: string) {
  const byteLength = (value: string) => new TextEncoder().encode(value).length;
  const questionBytes = byteLength(question);
  if (questionBytes > 1000) return null;
  let remaining = 4000 - questionBytes;
  const history: { role: 'user' | 'assistant'; content: string }[] = [];
  const candidates = session.messages.slice(0, -2).filter(message => message.text && (message.role === 'user' || message.status === 'complete')).slice(-8);
  for (const message of candidates.reverse()) {
    const bytes = byteLength(message.text);
    if (message.text.length <= 600 && bytes <= 1000 && bytes <= remaining) {
      history.push({ role: message.role, content: message.text });
      remaining -= bytes;
      if (history.length === 4) break;
    }
  }
  return history.reverse();
}
