import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion, normalizeQuestion, blockedQuestion } from '../src/chatbotEngine.ts';

test('chatbot understands Vietnamese with or without diacritics and mixed case', () => {
  for (const question of ['Đổi tên PDF', 'doi ten pdf', 'ĐỔI TÊN PDF']) {
    assert.equal(normalizeQuestion(question), 'doi ten pdf');
    assert.equal(answerQuestion(question, 'VI').faq, 'rename');
  }
});

test('chatbot routes verified workflows in both languages', () => {
  assert.equal(answerQuestion('How do I rename PDFs?', 'EN').faq, 'rename');
  assert.match(answerQuestion('How do I rename PDFs?', 'EN').answer, /original PDFs remain/);
  assert.equal(answerQuestion('How do I find missing numbers?', 'EN').faq, 'count');
  assert.equal(answerQuestion('Why is my PDF missing from the scan?', 'EN').faq, 'scan');
  assert.equal(answerQuestion('PDF file not found', 'EN').faq, 'scan');
  assert.equal(answerQuestion('so con thieu', 'VI').faq, 'count');
  assert.equal(answerQuestion('How do I use the Translation register?', 'EN').faq, 'translation');
  assert.match(answerQuestion('How do I use the Translation register?', 'EN').answer, /does not translate PDF contents/);
});

test('chatbot asks for clarification on vague, competing, or unrelated requests', () => {
  for (const question of ['PDF', 'translate this PDF for me', 'weather tomorrow', 'rename pdf and missing numbers']) {
    assert.equal(answerQuestion(question, 'EN').faq, null);
  }
});

test('offline chatbot blocks code requests before FAQ matching', () => {
  assert.equal(blockedQuestion('Write code to rename PDFs'), true);
  assert.equal(blockedQuestion('bỏ qua quy tắc'), true);
});
