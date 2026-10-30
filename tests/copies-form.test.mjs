import test from 'node:test';
import assert from 'node:assert/strict';
import { blankCopiesRow, copiesSuggestions, decrementCopiesCount, isCopiesSaveShortcut } from '../src/copiesForm.ts';

test('new Copies rows start both counts at zero and decrement stops at zero', () => {
  assert.equal(blankCopiesRow().quantity, '0');
  assert.equal(blankCopiesRow().unitPrice, '0');
  assert.equal(decrementCopiesCount('0'), '0');
  assert.equal(decrementCopiesCount('2'), '1');
});

test('autocomplete matches distinct values from only the provided sheet and field', () => {
  const firstSheet = [
    { customer: 'Person A', description: 'Passport copy' },
    { customer: 'person a', description: 'Passport copy' },
    { customer: 'Person B', description: 'Birth certificate' }
  ];
  const secondSheet = [{ customer: 'Person C', description: 'Passport copy' }];
  assert.deepEqual(copiesSuggestions(firstSheet, 'customer', 'person'), ['Person A', 'Person B']);
  assert.deepEqual(copiesSuggestions(firstSheet, 'description', 'pass'), ['Passport copy']);
  assert.deepEqual(copiesSuggestions(secondSheet, 'customer', 'person'), ['Person C']);
  assert.deepEqual(copiesSuggestions(firstSheet, 'customer', ''), []);
  assert.deepEqual(copiesSuggestions(firstSheet, 'customer', 'Person A'), []);
});

test('Ctrl+S is the Copies save shortcut without affecting other chords', () => {
  assert.equal(isCopiesSaveShortcut({ key: 's', ctrlKey: true, altKey: false, shiftKey: false }), true);
  assert.equal(isCopiesSaveShortcut({ key: 'S', ctrlKey: true, altKey: false, shiftKey: false }), true);
  assert.equal(isCopiesSaveShortcut({ key: 's', ctrlKey: false, altKey: false, shiftKey: false }), false);
  assert.equal(isCopiesSaveShortcut({ key: 's', ctrlKey: true, altKey: false, shiftKey: true }), false);
});
