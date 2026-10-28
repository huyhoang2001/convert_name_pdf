import { faqs, type ChatLanguage } from './chatbotFaq.ts';
import policy from '../electron/chat-policy.json' with { type: 'json' };

export function normalizeQuestion(value: string) {
  return value.toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function blockedQuestion(value: string) {
  const normalized = normalizeQuestion(value);
  return policy.blockedPatterns.some(pattern => new RegExp(pattern).test(normalized));
}

export function answerQuestion(question: string, language: ChatLanguage) {
  const words = normalizeQuestion(question).split(' ').filter(Boolean);
  const padded = ` ${words.join(' ')} `;
  const ranked = faqs.map(faq => {
    const score = faq.terms.reduce((sum, term) => {
      const normalized = normalizeQuestion(term);
      const parts = normalized.split(' ');
      if (padded.includes(` ${normalized} `)) return sum + parts.length * 2;
      return parts.every(part => words.includes(part)) ? sum + parts.length : sum;
    }, 0);
    return { faq, score };
  }).sort((a, b) => b.score - a.score);
  const [first, second] = ranked;
  if (!first || first.score < 2 || first.score - (second?.score ?? 0) < 2) return { answer: language === 'VI' ? 'Bạn muốn hỏi về tính năng nào? Hãy chọn một câu hỏi bên dưới hoặc nói rõ hơn.' : 'Which feature do you mean? Choose a question below or add more detail.', faq: null };
  return { answer: first.faq.answer[language], faq: first.faq.id };
}
