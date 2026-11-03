import knowledge from './chatbotKnowledge.json' with { type: 'json' };

export type ChatLanguage = 'EN' | 'VI';
export type Faq = { id: string; prompts: Record<ChatLanguage, string>; answer: Record<ChatLanguage, string>; terms: string[] };

export const faqs = knowledge as Faq[];
