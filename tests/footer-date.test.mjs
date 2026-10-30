import test from 'node:test';
import assert from 'node:assert/strict';
import { formatFooterDate, msUntilNextLocalDay } from '../src/footerDate.ts';

test('footer date uses dd/mm/yyyy and the localized weekday', () => {
  const day = new Date(2026, 9, 30);
  assert.equal(formatFooterDate(day, 'EN'), 'Friday, 30/10/2026');
  assert.equal(formatFooterDate(day, 'VI'), 'Thứ Sáu, 30/10/2026');
});

test('footer date refresh timer reaches the next local midnight', () => {
  const beforeMidnight = new Date(2026, 9, 30, 23, 59, 59, 500);
  assert.equal(msUntilNextLocalDay(beforeMidnight), 500);
  assert.equal(formatFooterDate(new Date(beforeMidnight.getTime() + msUntilNextLocalDay(beforeMidnight)), 'EN'), 'Saturday, 31/10/2026');
});
