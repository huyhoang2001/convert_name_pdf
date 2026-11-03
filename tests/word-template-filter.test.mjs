import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTemplates } from '../src/word/templateFilter.ts';

const templates = [
  { name: 'First', topic: 'General', kind: 'Document', pinned: true },
  { name: 'Second', topic: 'Legal', kind: 'Document', pinned: false },
];

test('Templates shows all matching entries and Favorites shows only starred matches', () => {
  assert.deepEqual(filterTemplates(templates, false, 'document', 'en-US').map(row => row.name), ['First', 'Second']);
  assert.deepEqual(filterTemplates(templates, true, '', 'en-US').map(row => row.name), ['First']);
  assert.deepEqual(filterTemplates(templates, true, 'legal', 'en-US'), []);
});
