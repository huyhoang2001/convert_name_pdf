import test from 'node:test';
import assert from 'node:assert/strict';
import { compactReferenceNumbers, insertReferenceNumber, nextReferenceNumber } from '../src/copiesSequence.ts';

test('Copies reference numbers continue from the previous sheet and insert custom numbers without replacing rows', () => {
  const priorSheet = [{ refNo: '01' }, { refNo: '10' }];
  assert.equal(nextReferenceNumber([], Number(priorSheet.at(-1).refNo)), '11');
  const rows = [{ id: 'a', refNo: '11' }, { id: 'b', refNo: '12' }];
  assert.deepEqual(insertReferenceNumber(rows, { id: 'custom', refNo: '12', manualRefNo: true }), [
    { id: 'a', refNo: '11' }, { id: 'custom', refNo: '12', manualRefNo: true }, { id: 'b', refNo: '13' }
  ]);
  assert.deepEqual(compactReferenceNumbers([{ id: 'a', refNo: '11' }, { id: 'b', refNo: '13' }], { id: 'custom', refNo: '12', manualRefNo: true }).map(row => row.refNo), ['11', '12']);
});
