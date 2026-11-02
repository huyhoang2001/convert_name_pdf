import test from 'node:test';
import assert from 'node:assert/strict';
import { amountInWords } from '../src/copiesWords.ts';

test('Copies totals are written in English and Vietnamese words', () => {
  assert.equal(amountInWords(0, 'EN'), 'Zero VND');
  assert.equal(amountInWords(15000, 'EN'), 'Fifteen thousand VND');
  assert.equal(amountInWords(80000, 'EN'), 'Eighty thousand VND');
  assert.equal(amountInWords(150000, 'EN'), 'One hundred fifty thousand VND');
  assert.equal(amountInWords(80000), 'Tám mươi ngàn đồng');
  assert.equal(amountInWords(15000), 'Mười lăm ngàn đồng');
  assert.equal(amountInWords(1005), 'Một ngàn không trăm lẻ năm đồng');
});
