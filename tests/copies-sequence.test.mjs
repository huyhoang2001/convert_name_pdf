import test from 'node:test';
import assert from 'node:assert/strict';
import { compactReferenceNumbers, compactSortedReferenceNumbers, distributeRows, insertReferenceNumber, inspectAdjacentReferenceNumbers, inspectReferenceNumbers, nextReferenceNumber } from '../src/copiesSequence.ts';

test('Copies reference numbers continue from the previous sheet and insert custom numbers without replacing rows', () => {
  const priorSheet = [{ refNo: '01' }, { refNo: '10' }];
  assert.equal(nextReferenceNumber([], Number(priorSheet.at(-1).refNo)), '11');
  const rows = [{ id: 'a', refNo: '11' }, { id: 'b', refNo: '12' }];
  assert.deepEqual(insertReferenceNumber(rows, { id: 'custom', refNo: '12', manualRefNo: true }), [
    { id: 'a', refNo: '11' }, { id: 'custom', refNo: '12', manualRefNo: true }, { id: 'b', refNo: '13' }
  ]);
  assert.deepEqual(compactReferenceNumbers([{ id: 'a', refNo: '11' }, { id: 'b', refNo: '13' }], { id: 'custom', refNo: '12', manualRefNo: true }).map(row => row.refNo), ['11', '12']);
});

test('Copies custom references move to their sequence sheet and push later rows across sheets', () => {
  const sheets = [
    { id: 'one', rows: [{ id: 'a', refNo: '1' }, { id: 'b', refNo: '2' }] },
    { id: 'two', rows: [{ id: 'c', refNo: '3' }, { id: 'd', refNo: '4' }] }
  ];
  const ordered = insertReferenceNumber(sheets.flatMap(sheet => sheet.rows), { id: 'custom', refNo: '2', manualRefNo: true });
  assert.deepEqual(distributeRows(sheets, ordered).map(sheet => sheet.rows.map(row => [row.id, row.refNo])), [
    [['a', '1'], ['custom', '2']], [['b', '3'], ['c', '4'], ['d', '5']]
  ]);
});

test('Copies refresh sorts references across sheets and fills gaps', () => {
  const rows = [{ refNo: '3489' }, { refNo: '3' }, { refNo: '3490' }, { refNo: '12' }];
  assert.deepEqual(compactSortedReferenceNumbers(rows).map(row => row.refNo), ['3', '4', '5', '6']);
});

test('Copies Ref. No. audit reports compact gaps and ignores invalid values', () => {
  assert.deepEqual(inspectReferenceNumbers([]), { checked: 0, min: null, max: null, ranges: [], missingCount: 0 });
  assert.deepEqual(inspectReferenceNumbers(['3', '4', '5']), { checked: 3, min: 3, max: 5, ranges: [], missingCount: 0 });
  assert.deepEqual(inspectReferenceNumbers(['1', '', '4', 'bad', '8', '0', '2.5']), { checked: 3, min: 1, max: 8, ranges: [{ start: 2, end: 3 }, { start: 5, end: 7 }], missingCount: 5 });
  assert.deepEqual(inspectReferenceNumbers(['1', '900000000000000']), { checked: 2, min: 1, max: 900000000000000, ranges: [{ start: 2, end: 899999999999999 }], missingCount: 899999999999998 });
});

test('Copies adjacent-sheet Ref. No. audit checks pair gaps and the row-order boundary', () => {
  const sequential = inspectAdjacentReferenceNumbers(['1', '2', 'bad'], ['3', '5']);
  assert.equal(sequential.boundarySequential, true);
  assert.equal(sequential.currentLast, 2);
  assert.equal(sequential.nextFirst, 3);
  assert.deepEqual(sequential.ranges, [{ start: 4, end: 4 }]);
  const discontinuous = inspectAdjacentReferenceNumbers(['1', '3'], ['5', '6']);
  assert.equal(discontinuous.boundarySequential, false);
  assert.deepEqual(discontinuous.ranges, [{ start: 2, end: 2 }, { start: 4, end: 4 }]);
  assert.equal(inspectAdjacentReferenceNumbers(['bad'], ['']).boundarySequential, null);
  assert.equal(inspectAdjacentReferenceNumbers(['1'], []).hasNextSheet, true);
  assert.equal(inspectAdjacentReferenceNumbers(['1'], []).boundarySequential, null);
  assert.equal(inspectAdjacentReferenceNumbers(['1']).hasNextSheet, false);
});
