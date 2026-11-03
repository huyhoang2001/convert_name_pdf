import test from 'node:test';
import assert from 'node:assert/strict';
import { readPageColumns, shouldShowPrintOverview } from '../src/word/readOverviewLayout.ts';

test('Read Mode fits up to three pages across without forcing narrow pages', () => {
  assert.equal(readPageColumns(1800, 120), 3);
  assert.equal(readPageColumns(1300, 600), 2);
  assert.equal(readPageColumns(900, 600), 1);
  assert.equal(readPageColumns(500, 0), 1);
});

test('Print Layout uses the overview only when zoomed out and two pages fit', () => {
  assert.equal(shouldShowPrintOverview(0.1, 1800, 120), true);
  assert.equal(shouldShowPrintOverview(0.5, 1300, 600), true);
  assert.equal(shouldShowPrintOverview(0.5, 900, 600), false);
  assert.equal(shouldShowPrintOverview(1, 1800, 800), false);
});
