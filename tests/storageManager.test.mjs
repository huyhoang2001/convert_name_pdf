import assert from 'node:assert/strict';
import test from 'node:test';
import { checkMessageKey, storageSelectors } from '../src/storageSelectors.ts';
import en from '../src/locales/en.json' with { type: 'json' };
import vi from '../src/locales/vi.json' with { type: 'json' };

test('Storage Manager lists all six selectors, Copies first', () => {
  assert.deepEqual(storageSelectors.map(item => item.id), ['copies', 'count', 'rename', 'signature', 'translation', 'word']);
});

test('only Rename PDFs exposes persisted Backup and Output fields', () => {
  for (const item of storageSelectors) {
    assert.deepEqual(item.fields.map(([kind]) => kind), item.id === 'rename' ? ['backup', 'output'] : []);
  }
});

test('every Storage Manager label exists in English and Vietnamese', () => {
  const keys = [...storageSelectors.flatMap(item => [item.label, item.note, ...item.fields.map(([, key]) => key)]), ...Object.values(checkMessageKey), 'storageManager', 'storageChoose', 'storageOpen', 'storageCheck', 'storageReset'];
  for (const key of keys) assert.ok(en[key] && vi[key], key);
});

