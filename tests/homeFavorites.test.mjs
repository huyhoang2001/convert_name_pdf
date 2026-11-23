import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultHomeFavorites, sidebarHomeFeatures, toggleHomeFeatureFavorite } from '../src/homeFavorites.mjs';

const cards = ['calendar', 'rename', 'count', 'translation', 'signature', 'copies', 'word', 'settings'].map(tool => ({ tool }));

test('first-launch favorites preserve every existing sidebar selector', () => {
  assert.deepEqual([...defaultHomeFavorites], cards.map(card => card.tool));
});

test('sidebar favorites filter selectors without changing order and always retain Settings', () => {
  assert.deepEqual(sidebarHomeFeatures(cards, ['translation', 'calendar']), [cards[0], cards[3], cards[7]]);
});

test('favorite stars toggle an ID on and off without coupling to template favorites', () => {
  const templateFavorites = ['template-1'];
  const added = toggleHomeFeatureFavorite([], 'translation');
  assert.deepEqual(added, ['translation']);
  assert.deepEqual(toggleHomeFeatureFavorite(added, 'translation'), []);
  assert.deepEqual(templateFavorites, ['template-1']);
});
