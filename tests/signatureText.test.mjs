import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { applySignatureDuplicateFill, duplicateSignatureNumbers, filterRegisterSuggestions, formatSignatureNumber, insertSignatureRow, nextAvailableSignatureNumber, nextSignatureNumberAfterHighWater, normalizeSignaturePerson, signatureDocumentSuggestions, splitSearchMatches, translationPersonSuggestions, uppercaseSignatureText } from '../src/signatureText.mjs';
import { formatRegisterDate, parseRegisterDate } from '../src/registerDate.mjs';

test('formats and parses valid register dates as dd/mm/yyyy', () => {
  assert.equal(formatRegisterDate('2026-11-17'), '17/11/2026');
  assert.equal(parseRegisterDate('17/11/2026'), '2026-11-17');
  assert.equal(parseRegisterDate('31/02/2026'), '');
});

test('parses and formats ambiguous business dates in day-first order', () => {
  for (const [display, iso] of [
    ['05/01/2026', '2026-01-05'], ['01/05/2026', '2026-05-01'],
    ['09/11/2026', '2026-11-09'], ['19/11/2026', '2026-11-19'],
    ['31/12/2026', '2026-12-31'], ['29/02/2028', '2028-02-29'],
  ]) {
    assert.equal(parseRegisterDate(display), iso);
    assert.equal(formatRegisterDate(iso), display);
  }
});

test('manual STT can fill the first gap', () => {
  assert.equal(nextAvailableSignatureNumber(Array.from({ length: 30 }, (_, index) => ({ number: String(index + 1) }))), '31');
  assert.equal(nextAvailableSignatureNumber([1, 2, 3, 5, 6].map(number => ({ number: String(number) }))), '04');
});

test('automatic STT continues above the established high-water mark without reusing gaps', () => {
  assert.equal(nextSignatureNumberAfterHighWater(Array.from({ length: 30 }, (_, index) => ({ number: String(index + 1) }))), '31');
  assert.equal(nextSignatureNumberAfterHighWater([1, 2, 3, 5, 6].map(number => ({ number: String(number) }))), '07');
  assert.equal(nextSignatureNumberAfterHighWater([{ number: '1' }, { number: '2' }], 30), '31');
});

test('new STTs use a minimum of two digits without truncating larger values', () => {
  assert.deepEqual([1, 9, 10, 750, 1000].map(formatSignatureNumber), ['01', '09', '10', '750', '1000']);
  assert.equal(nextAvailableSignatureNumber([]), '01');
  assert.equal(nextSignatureNumberAfterHighWater([], 0), '01');
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

test('information suggestions use only person values, preserve spelling, deduplicate, and match Vietnamese without diacritics', () => {
  const rows = [{ person: 'Nguyễn Thị Ánh CCCD: 123' }, { person: 'Hồ Sơ' }, { person: 'NGUYỄN THỊ ÁNH CCCD: 123' }, { document: 'Nguyễn Thị Ánh CCCD: 123', notes: 'Ngoài phạm vi' }];
  const saved = translationPersonSuggestions(rows, '');
  assert.deepEqual(saved, ['NGUYỄN THỊ ÁNH CCCD: 123', 'Hồ Sơ']);
  assert.deepEqual(filterRegisterSuggestions(saved, 'nguyen thi'), ['NGUYỄN THỊ ÁNH CCCD: 123']);
  assert.deepEqual(translationPersonSuggestions(rows, 'ho so'), ['Hồ Sơ']);
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

test('inserts duplicates after their group and new STTs before the next higher group', () => {
  const rows = [{ number: '1', id: 'first' }, { number: '2', id: 'other' }, { number: '01', id: 'last' }, { number: '3', id: 'tail' }];
  const added = insertSignatureRow(rows, { number: '1', id: 'added' });
  assert.deepEqual(added.map(row => row.id), ['first', 'other', 'last', 'added', 'tail']);
  assert.deepEqual(insertSignatureRow(added, { number: '1', id: 'second-added' }).map(row => row.id), ['first', 'other', 'last', 'added', 'second-added', 'tail']);
  assert.deepEqual(insertSignatureRow(rows, { number: '4', id: 'new-number' }).map(row => row.id), ['first', 'other', 'last', 'tail', 'new-number']);
  assert.deepEqual(insertSignatureRow([{ number: '788', id: 'before' }, { number: '790', id: 'after' }], { number: '789', id: 'missing' }).map(row => row.id), ['before', 'missing', 'after']);
  assert.deepEqual(insertSignatureRow([{ number: '02', id: 'two' }], { number: '01', id: 'one' }).map(row => row.id), ['one', 'two']);
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
