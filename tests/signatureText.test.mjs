import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { applySignatureDuplicateFill, duplicateSignatureNumbers, insertSignatureRow, nextAvailableSignatureNumber, nextSignatureNumberAfterHighWater, normalizeSignaturePerson, signatureDocumentSuggestions, splitSearchMatches, uppercaseSignatureText } from '../src/signatureText.mjs';
import { formatRegisterDate, parseRegisterDate } from '../src/registerDate.mjs';

test('formats and parses valid register dates as dd/mm/yyyy', () => {
  assert.equal(formatRegisterDate('2026-11-17'), '17/11/2026');
  assert.equal(parseRegisterDate('17/11/2026'), '2026-11-17');
  assert.equal(parseRegisterDate('31/02/2026'), '');
});

test('manual STT can fill the first gap', () => {
  assert.equal(nextAvailableSignatureNumber(Array.from({ length: 30 }, (_, index) => ({ number: String(index + 1) }))), '31');
  assert.equal(nextAvailableSignatureNumber([1, 2, 3, 5, 6].map(number => ({ number: String(number) }))), '4');
});

test('automatic STT continues above the established high-water mark without reusing gaps', () => {
  assert.equal(nextSignatureNumberAfterHighWater(Array.from({ length: 30 }, (_, index) => ({ number: String(index + 1) }))), '31');
  assert.equal(nextSignatureNumberAfterHighWater([1, 2, 3, 5, 6].map(number => ({ number: String(number) }))), '7');
  assert.equal(nextSignatureNumberAfterHighWater([{ number: '1' }, { number: '2' }], 30), '31');
});

test('removes numbered person prefixes and splits same-line entries', () => {
  assert.equal(
    normalizeSignaturePerson('1.ÔNG: A CCCD: 1 2.BÀ: B CCCD: 2 3.ÔNG: C CCCD: 3'),
    'ÔNG: A CCCD: 1\nBÀ: B CCCD: 2\nÔNG: C CCCD: 3',
  );
});

test('preserves existing line breaks and ordinary text', () => {
  assert.equal(normalizeSignaturePerson('BÀ: A\nCCCD: 1\n2.ÔNG: B'), 'BÀ: A\nCCCD: 1\nÔNG: B');
  assert.equal(normalizeSignaturePerson('First paragraph\nSecond paragraph'), 'First paragraph\nSecond paragraph');
});

test('uppercases Vietnamese register text and preserves line breaks', () => {
  assert.equal(uppercaseSignatureText('Công chứng viên Nguyễn Thị Xuân\nSơ yếu lý lịch'), 'CÔNG CHỨNG VIÊN NGUYỄN THỊ XUÂN\nSƠ YẾU LÝ LỊCH');
});

test('document suggestions are unique, newest first, and filtered case-insensitively', () => {
  const rows = [{ document: 'Sơ yếu lý lịch' }, { document: 'Giấy ủy quyền' }, { document: 'SƠ YẾU LÝ LỊCH' }, { document: '' }];
  assert.deepEqual(signatureDocumentSuggestions(rows, ''), ['SƠ YẾU LÝ LỊCH', 'GIẤY ỦY QUYỀN']);
  assert.deepEqual(signatureDocumentSuggestions(rows, 'giấy'), ['GIẤY ỦY QUYỀN']);
});

test('search matching marks every matching occurrence without losing surrounding text', () => {
  assert.deepEqual(splitSearchMatches('584 / reference 584', '584'), [
    { text: '584', match: true },
    { text: ' / reference ', match: false },
    { text: '584', match: true },
  ]);
  assert.deepEqual(splitSearchMatches('text', ''), [{ text: 'text', match: false }]);
});

test('detects duplicate STTs by numeric value', () => {
  assert.deepEqual(duplicateSignatureNumbers([{ number: '01' }, { number: '1' }, { number: '2' }]), new Set([1]));
});

test('inserts added STTs after the last matching number and appends new numbers', () => {
  const rows = [{ number: '1', id: 'first' }, { number: '2', id: 'other' }, { number: '01', id: 'last' }, { number: '3', id: 'tail' }];
  const added = insertSignatureRow(rows, { number: '1', id: 'added' });
  assert.deepEqual(added.map(row => row.id), ['first', 'other', 'last', 'added', 'tail']);
  assert.deepEqual(insertSignatureRow(added, { number: '1', id: 'second-added' }).map(row => row.id), ['first', 'other', 'last', 'added', 'second-added', 'tail']);
  assert.deepEqual(insertSignatureRow(rows, { number: '4', id: 'new-number' }).map(row => row.id), ['first', 'other', 'last', 'tail', 'new-number']);
});

test('applies duplicate fill to exported Excel rows', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Register');
  const row = sheet.addRow(['1', 'Record']);
  applySignatureDuplicateFill(row);
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.equal(reopened.getWorksheet('Register').getCell('A1').fill.fgColor.argb, 'FFFFE2A8');
  assert.equal(reopened.getWorksheet('Register').getCell('B1').fill.fgColor.argb, 'FFFFE2A8');
});
