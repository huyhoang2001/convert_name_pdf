import test from 'node:test';
import assert from 'node:assert/strict';
import { adjacentTabId, isSheetNavigationShortcut } from '../src/word/tabNavigation.ts';

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

test('register sheet shortcuts require the visible register and a non-editing Ctrl+Page key', () => {
  const shortcut = { key: 'PageDown', ctrlKey: true, shiftKey: false, altKey: false };
  assert.equal(isSheetNavigationShortcut(shortcut, true, false), true);
  assert.equal(isSheetNavigationShortcut(shortcut, false, false), false);
  assert.equal(isSheetNavigationShortcut(shortcut, true, true), false);
  assert.equal(isSheetNavigationShortcut({ ...shortcut, key: 'PageUp' }, true, false), true);
  assert.equal(isSheetNavigationShortcut({ ...shortcut, ctrlKey: false }, true, false), false);
  assert.equal(isSheetNavigationShortcut({ ...shortcut, shiftKey: true }, true, false), false);
  assert.equal(isSheetNavigationShortcut({ ...shortcut, altKey: true }, true, false), false);
});
