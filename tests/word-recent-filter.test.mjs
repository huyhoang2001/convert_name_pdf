import test from 'node:test';
import assert from 'node:assert/strict';
import { filterRecentDocuments } from '../src/word/recentFilter.ts';

const rows = [
  { path: 'a', pinned: true, managed: true },
  { path: 'b', pinned: false, managed: true },
  { path: 'c', pinned: true, managed: false },
];

test('Recent and Favorites tabs preserve the B6H and Other filters', () => {
  assert.deepEqual(filterRecentDocuments(rows, false, 'all').map(row => row.path), ['a', 'b', 'c']);
  assert.deepEqual(filterRecentDocuments(rows, true, 'all').map(row => row.path), ['a', 'c']);
  assert.deepEqual(filterRecentDocuments(rows, true, 'managed').map(row => row.path), ['a']);
  assert.deepEqual(filterRecentDocuments(rows, true, 'other').map(row => row.path), ['c']);
});
