import test from 'node:test';
import assert from 'node:assert/strict';
import { adjacentTabId } from '../src/word/tabNavigation.ts';

test('Word tab shortcuts move in either direction and wrap around', () => {
  const tabs = ['a', 'b', 'c'];
  assert.equal(adjacentTabId(tabs, 'a', 1), 'b');
  assert.equal(adjacentTabId(tabs, 'c', 1), 'a');
  assert.equal(adjacentTabId(tabs, 'c', -1), 'b');
  assert.equal(adjacentTabId(tabs, 'a', -1), 'c');
});

test('Word tab shortcuts do nothing with fewer than two tabs or an unknown active tab', () => {
  assert.equal(adjacentTabId([], 'a', 1), null);
  assert.equal(adjacentTabId(['a'], 'a', -1), null);
  assert.equal(adjacentTabId(['a', 'b'], 'missing', 1), null);
});
