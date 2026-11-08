import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptChatQuestion, classifyChatError, emptyChatSession, isChatSession, onlineChatHistory, restoreChatSession, settleChatReply } from '../src/chatbotSession.ts';
import { answerQuestion } from '../src/chatbotEngine.ts';

test('one session accepts exactly twenty questions across both modes', () => {
  let session = emptyChatSession();
  for (let index = 0; index < 20; index++) {
    const accepted = acceptChatQuestion(session, `Question ${index + 1}`, index % 2 ? 'online' : 'offline');
    assert.ok(accepted);
    session = accepted.session;
    assert.equal(session.userQuestionCount, index + 1);
  }
  assert.equal(acceptChatQuestion(session, 'Question 21', 'online'), null);
  assert.equal(session.messages.filter(message => message.role === 'user').length, 20);
  assert.ok(isChatSession(session));
});

test('accepted pending questions restore as interrupted and are not resent', () => {
  const accepted = acceptChatQuestion(emptyChatSession(), 'How do I save?', 'online');
  assert.ok(accepted);
  const restored = restoreChatSession(accepted.session);
  assert.equal(restored.userQuestionCount, 1);
  assert.equal(restored.messages.at(-1).status, 'interrupted');
  assert.equal(restoreChatSession(restored).userQuestionCount, 1);
  assert.equal(settleChatReply(accepted.session, accepted.requestId, 'done').messages.at(-1).status, 'complete');
});

test('session validation rejects count drift, excess messages, and oversized content', () => {
  const accepted = acceptChatQuestion(emptyChatSession(), 'Question', 'offline');
  assert.ok(accepted);
  assert.ok(!isChatSession({ ...accepted.session, userQuestionCount: 0 }));
  assert.ok(!isChatSession({ ...accepted.session, messages: Array(41).fill(accepted.session.messages[0]) }));
  assert.ok(!isChatSession({ ...accepted.session, messages: accepted.session.messages.map((message, i) => i ? message : { ...message, text: 'x'.repeat(1001) }) }));
});

test('Copies diagnostics answer only from the live field or validation identifier', () => {
  const result = answerQuestion('Why is this input invalid?', 'EN', { selector: 'copies', fieldId: 'quantity' });
  assert.equal(result.faq, 'copies');
  assert.match(result.answer, /whole number/);
  const unknown = answerQuestion('What should I enter here?', 'EN', { selector: 'copies' });
  assert.equal(unknown.faq, null);
  assert.match(unknown.answer, /Which Copies field/);
});

test('verified error and follow-up context guide help without storing raw errors', () => {
  assert.equal(classifyChatError(new Error('EACCES: private path')), 'access_error');
  assert.equal(classifyChatError('selected Excel file could not be found'), 'file_not_found');
  const errorAnswer = answerQuestion('I got an unexpected error when saving', 'EN', { selector: 'copies', errorCode: 'access_error' });
  assert.match(errorAnswer.answer, /could not access the selected file or folder/);
  assert.doesNotMatch(errorAnswer.answer, /private path/);
  const followup = answerQuestion('Tell me more about it', 'EN', { selector: 'word', previousFaqId: 'word-documents' });
  assert.equal(followup.faq, 'word-documents');
});

test('online history stays within existing UTF-8 message and request byte limits', () => {
  let session = emptyChatSession();
  for (let index = 0; index < 6; index++) {
    const accepted = acceptChatQuestion(session, `Question ${index} ${'ế'.repeat(200)}`, 'offline');
    assert.ok(accepted);
    session = settleChatReply(accepted.session, accepted.requestId, `Answer ${index} ${'ế'.repeat(200)}`);
  }
  const history = onlineChatHistory(session, 'current question');
  assert.ok(history);
  assert.ok(history.length <= 4);
  assert.ok(history.every(message => new TextEncoder().encode(message.content).length <= 1000));
  assert.ok(history.reduce((total, message) => total + new TextEncoder().encode(message.content).length, new TextEncoder().encode('current question').length) <= 4000);
  assert.equal(onlineChatHistory(session, 'ế'.repeat(501)), null);
});
