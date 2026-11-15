import data from './uiKnowledge.json' with { type: 'json' };
import type { ChatLanguage } from './chatbotFaq';
import type { ChatContext } from './chatbotSession';

export type UiEntry = {
  id: string;
  selector: string;
  page?: string;
  label: Record<ChatLanguage, string>;
  terms: string[];
  path: Record<ChatLanguage, string>;
  action: Record<ChatLanguage, string>;
  source: string;
  marker: string;
  labelKey?: string;
};
export const uiKnowledge = data.entries as UiEntry[];
const normalize = (value: string) => value.toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

export function relevantUiEntries(question: string, context?: ChatContext): UiEntry[] {
  const text = ` ${normalize(question)} `;
  const ranked = uiKnowledge.map(entry => {
    const matches = [...entry.terms, entry.label.EN, entry.label.VI].map(normalize)
      .filter(term => term && text.includes(` ${term} `));
    const score = matches.length ? Math.max(...matches.map(term => term.split(' ').length * 5)) +
      (context?.selector === entry.selector ? 4 : 0) + (context?.page === entry.page && entry.page ? 2 : 0) : 0;
    return { entry, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  if (!ranked.length) return [];
  return ranked.filter(item => item.score === ranked[0].score).slice(0, 3).map(item => item.entry);
}

export function uiLocationAnswer(question: string, language: ChatLanguage, context?: ChatContext): string | null {
  const text = normalize(question);
  if (!/(where|find|location|button|menu|o dau|tim|cho nao|nut|how.*(save|print|export|import|open)|cach.*(luu|in|xuat|nhap|mo))/.test(text)) return null;
  const entries = relevantUiEntries(question, context);
  if (!entries.length) return null;
  if ((!context || context.selector === 'home') && entries.length > 1 && /\b(save|luu)\b/.test(text) && !/(word|calendar|translation|signature|copies|settings|tai lieu|lich|dich thuat|chu ky|ban sao|cai dat)/.test(text)) {
    return language === 'VI' ? 'Bạn muốn lưu ở Word, Lịch, sổ Excel hay Cài đặt?' : 'Which workspace are you saving in: Word, Calendar, an Excel register, or Settings?';
  }
  return entries.map(entry => `${entry.label[language]}: ${entry.path[language]} ${entry.action[language]}`).join('\n');
}
