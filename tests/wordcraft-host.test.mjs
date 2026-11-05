import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { MAX_WORDCRAFT_DOCX_BYTES, advanceWordcraftStage, wordcraftBytes, wordcraftMessage, wordcraftTimeoutKind } from '../src/word/wordcraftProtocol.ts';

test('Wordcraft bridge accepts only messages from its same-origin iframe', () => {
  const frame = {};
  const event = { source: frame, origin: 'http://localhost:5175', data: { type: 'wordcraft:ready' } };
  assert.deepEqual(wordcraftMessage(event, frame, event.origin), event.data);
  assert.equal(wordcraftMessage({ ...event, source: {} }, frame, event.origin), null);
  assert.equal(wordcraftMessage({ ...event, origin: 'https://elsewhere.example' }, frame, event.origin), null);
  assert.equal(wordcraftMessage({ ...event, data: 'wordcraft:ready' }, frame, event.origin), null);
});

test('Wordcraft bridge rejects oversized and malformed document payloads', () => {
  assert.equal(wordcraftBytes(new ArrayBuffer(1024)), true);
  assert.equal(wordcraftBytes(new ArrayBuffer(MAX_WORDCRAFT_DOCX_BYTES + 1)), false);
  assert.equal(wordcraftBytes(new Uint8Array(1024)), false);
});

test('Wordcraft lifecycle accepts one ready/open sequence and a late ready after boot timeout', () => {
  let stage = 'wasm-starting';
  assert.equal(wordcraftTimeoutKind(stage), 'startup');
  stage = advanceWordcraftStage(stage, 'html-loaded');
  assert.equal(advanceWordcraftStage(stage, 'ready'), 'renderer-ready');
  stage = advanceWordcraftStage(stage, 'ready');
  assert.equal(advanceWordcraftStage(stage, 'ready'), null);
  stage = advanceWordcraftStage(stage, 'open-sent');
  assert.equal(wordcraftTimeoutKind(stage), 'import');
  stage = advanceWordcraftStage(stage, 'opened');
  assert.equal(advanceWordcraftStage(stage, 'opened'), null);
  stage = advanceWordcraftStage(stage, 'checked');
  assert.equal(stage, 'usable');
  assert.equal(advanceWordcraftStage(stage, 'ready'), null);
});

test('Wordcraft web shell reports asset boot failure and ignores later unrelated errors', () => {
  const html = readFileSync(new URL('../public/wordcraft/index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const listeners = new Map(), sent = [];
  const window = { addEventListener: (type, listener) => listeners.set(type, listener) };
  const parent = { location: { origin: 'http://localhost:5175' }, postMessage: (message, origin) => sent.push({ message, origin }) };
  runInNewContext(script, { window, parent, location: { search: '?host=parent', origin: parent.location.origin }, URLSearchParams, URL });
  listeners.get('error')({ target: { src: 'http://localhost:5175/wordcraft/wordcraft-web-broken.js' } });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].message.stage, 'asset-loading');
  assert.equal(sent[0].origin, parent.location.origin);
  listeners.get('TrunkApplicationStarted')();
  listeners.get('unhandledrejection')({ reason: 'later app error' });
  assert.equal(sent.length, 1);
});
