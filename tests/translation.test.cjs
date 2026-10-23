const test = require('node:test');
const assert = require('node:assert/strict');
const { fields, headers, fromRows, validate, loadSheets, validateSheets } = require('../electron/translation.cjs');
const vi = require('../src/locales/vi.json');
const en = require('../src/locales/en.json');

test('translation workbook rows map localized headers into records', () => {
  const record = fromRows([headers.VI, ['1', '1/7/2026', 'TRẦN THU HẰNG', 'Giấy phép lái xe', 'Nhật - Việt', 'Nguyễn Thị Xuân', '01', '10,000', '']])[0];
  assert.equal(record.person, 'TRẦN THU HẰNG');
  assert.equal(record.document, 'Giấy phép lái xe');
  assert.deepEqual(fields.map(field => record[field]), ['1', '1/7/2026', 'TRẦN THU HẰNG', 'Giấy phép lái xe', 'Nhật - Việt', 'Nguyễn Thị Xuân', '01', '10,000', '']);
});

test('translation registry rejects incomplete imported workbook headers and malformed persisted rows', () => {
  assert.throws(() => fromRows([['wrong']]), /all 9/);
  assert.throws(() => validate([{ id: 'x', number: 1 }]), /Invalid/);
});

test('Vietnamese register labels retain correct Unicode text', () => {
  assert.equal(vi.translation, 'Dịch thuật');
  assert.match(vi.translationPerson, /căn cước/);
});

test('legacy rows migrate to a default sheet and sheet names must be valid and unique', () => {
  assert.equal(loadSheets([])[0].name, 'Dịch thuật');
  assert.equal(loadSheets([{ id: 'default', name: 'Translation', rows: [] }])[0].name, 'Translation');
  assert.throws(() => validateSheets([{ id: 'a', name: 'A', rows: [] }, { id: 'b', name: 'a', rows: [] }]), /sheet name/i);
  assert.throws(() => validateSheets([{ id: 'a', name: 'Bad/Name', rows: [] }]), /sheet name/i);
});

test('Excel import accepts the exact English and Vietnamese export headers', () => {
  const keys = ['translationNumber', 'translationDate', 'translationPerson', 'translationDocument', 'translationLanguages', 'translationCertifier', 'translationCopies', 'translationFee', 'translationNotes'];
  assert.deepEqual(headers.EN, keys.map(key => en[key]));
  assert.deepEqual(headers.VI, keys.map(key => vi[key]));
});
