import test from 'node:test';
import assert from 'node:assert/strict';
import { nextWordZoom } from '../src/word/zoom.ts';

test('Ctrl+wheel zoom steps in both directions and stays within editor bounds', () => {
  assert.equal(nextWordZoom(1, -100), 1.1);
  assert.equal(nextWordZoom(1, 100), 0.9);
  assert.equal(nextWordZoom(2, -100), 2);
  assert.equal(nextWordZoom(0.2, 100), 0.1);
  assert.equal(nextWordZoom(0.1, 100), 0.1);
  assert.equal(nextWordZoom(0.1, -100), 0.2);
  assert.equal(nextWordZoom(2.1, -100), 2);
});
