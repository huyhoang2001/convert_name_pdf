import test from 'node:test';
import assert from 'node:assert/strict';
import { compactReferenceNumbers, compactSortedReferenceNumbers, distributeRows, insertReferenceNumber, nextReferenceNumber } from '../src/copiesSequence.ts';

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
