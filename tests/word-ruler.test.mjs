import test from 'node:test';
import assert from 'node:assert/strict';
import { moveTabStop, putTabStop, removeTabStop, tabPositionFromClientX } from '../src/word/rulerTabs.ts';

const page = { pageWidthTwips: 12240, marginsTwips: { left: 1440, right: 1440 } };

test('ruler tab positions use document margins, units, and RTL direction', () => {
  const rect = { left: 100, width: 600 };
  assert.equal(tabPositionFromClientX(100, rect, page, false, 'inch'), 0);
  assert.equal(tabPositionFromClientX(700, rect, page, false, 'inch'), 9360);
  assert.equal(tabPositionFromClientX(400, rect, page, true, 'inch'), 4680);
});

test('tab stops can be placed, moved over an existing stop, and removed', () => {
  const left = { positionTwips: 1440, alignment: 'left' };
  const right = { positionTwips: 2880, alignment: 'right' };
  const centered = { positionTwips: 4320, alignment: 'center' };
  assert.deepEqual(putTabStop([left], right), [left, right]);
  assert.deepEqual(moveTabStop([left, right], 1440, 2880), [{ ...left, positionTwips: 2880 }]);
  assert.deepEqual(removeTabStop([left, right], 1440), [right]);
  assert.deepEqual(putTabStop([left], centered), [left, centered]);
});
