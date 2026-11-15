import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { uiKnowledge, relevantUiEntries, uiLocationAnswer } from '../src/uiKnowledge.ts';
import en from '../src/locales/en.json' with { type: 'json' };
import vi from '../src/locales/vi.json' with { type: 'json' };
import manifest from '../src/uiKnowledge.json' with { type: 'json' };

test('UI guidance is versioned, bounded, bilingual, and anchored to current controls', () => {
  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;
  assert.equal(manifest.appVersion, version);
  assert.ok(uiKnowledge.length >= 25 && uiKnowledge.length <= 100);
  assert.equal(new Set(uiKnowledge.map(entry => entry.id)).size, uiKnowledge.length);
  for (const entry of uiKnowledge) {
    const source = readFileSync(new URL('../' + entry.source, import.meta.url), 'utf8');
    assert.ok(source.includes(entry.marker), `${entry.id}: missing source marker`);
    assert.ok(entry.label.EN && entry.label.VI && entry.path.EN && entry.path.VI && entry.action.EN && entry.action.VI);
    if (entry.labelKey) {
      assert.equal(entry.label.EN, en[entry.labelKey], entry.id);
      assert.equal(entry.label.VI, vi[entry.labelKey], entry.id);
    }
  }
  const calendar = readFileSync(new URL('../src/CalendarWorkspace.tsx', import.meta.url), 'utf8');
  assert.ok(calendar.includes('onClick={() => void exportData()}'));
  assert.ok(calendar.includes('onClick={() => backupInput.current?.click()}'));
  assert.ok(new TextEncoder().encode(JSON.stringify(manifest)).length < 40_000);
});

test('location retrieval follows active workspace and asks when Save is ambiguous', () => {
  assert.deepEqual(relevantUiEntries('Where is Save?', { selector: 'word', page: 'editor' }).map(entry => entry.id), ['word-save']);
  assert.deepEqual(relevantUiEntries('Where is Save As?', { selector: 'word', page: 'editor' }).map(entry => entry.id), ['word-save-as']);
  assert.deepEqual(relevantUiEntries('Where is Export Backup?', { selector: 'calendar' }).map(entry => entry.id), ['calendar-export']);
  assert.deepEqual(relevantUiEntries('Where can I change the storage path?', { selector: 'settings', page: 'storage' }).map(entry => entry.id), ['settings-storage']);
  assert.deepEqual(relevantUiEntries('Where is the Word template folder?', { selector: 'word', page: 'home' }).map(entry => entry.id), ['word-folders']);
  assert.match(uiLocationAnswer('Where is Save?', 'EN', { selector: 'home' }), /Which workspace/);
  assert.match(uiLocationAnswer('Lưu ở đâu?', 'VI', { selector: 'word', page: 'editor' }), /Word & Mẫu/);
  assert.equal(uiLocationAnswer('Where is the launch rocket button?', 'EN', { selector: 'home' }), null);
  assert.equal(relevantUiEntries('nonsense feature').length, 0);
});
