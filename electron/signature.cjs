const fields = ['number', 'date', 'person', 'document', 'certifier', 'copies', 'fee', 'notes'];
const headers = [
  'Số Chứng thực/Số thứ tự',
  'Ngày tháng năm chứng thực',
  'Họ tên, số Thẻ căn cước công dân/Thẻ căn cước/Căn cước điện tử/Giấy chứng nhận căn cước hoặc Hộ chiếu/giấy tờ xuất nhập cảnh/giấy tờ có giá trị đi lại quốc tế',
  'Tên của giấy tờ, văn bản đã chứng thực chữ ký/điểm chỉ',
  'Họ tên, chức danh người ký chứng thực',
  'Số lượng giấy giấy tờ, văn bản đã chứng thực chữ ký/điểm chỉ',
  'Phí chứng thực',
  'Ghi chú'
];
function normalize(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
function parseRows(rows) {
  const indexes = fields.map((field, index) => {
    const expected = normalize(headers[index]);
    return rows[0]?.findIndex(value => {
      const actual = normalize(value);
      return actual === expected || (Math.min(actual.length, expected.length) >= 32 && (actual.startsWith(expected) || expected.startsWith(actual)));
    }) ?? -1;
  });
  if (indexes.some(index => index < 0)) return null;
  return rows.slice(1).filter(row => indexes.slice(1).some(index => String(row[index] ?? '').trim())).map((row, index) => Object.fromEntries([
    ['id', `signature-import-${Date.now()}-${index}`],
    ...fields.map((field, fieldIndex) => [field, String(row[indexes[fieldIndex]] ?? '')])
  ]));
}
function reindex(rows) { return rows.map((row, index) => ({ ...row, number: String(index + 1).padStart(2, '0') })); }
function validate(rows) {
  if (!Array.isArray(rows) || rows.length > 100000) throw Error('Invalid signature register data.');
  const ids = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw Error('Invalid signature register data.');
    ids.add(row.id);
    for (const field of fields.slice(1)) if (typeof row[field] !== 'string' || row[field].length > 20000) throw Error('Invalid signature register data.');
    if (row.copies && !/^\d+$/.test(row.copies)) throw Error('Document count must be a whole number.');
    if (row.fee && (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(row.fee) || !Number.isSafeInteger(Number(row.fee.replaceAll(',', ''))))) throw Error('Certification fee must be a whole number.');
  }
}
function validateSheets(sheets) {
  if (!Array.isArray(sheets) || !sheets.length || sheets.length > 255) throw Error('Invalid signature register sheets.');
  const names = new Set();
  for (const sheet of sheets) {
    if (!sheet || typeof sheet.id !== 'string' || !sheet.id || typeof sheet.name !== 'string' || !sheet.name.trim() || sheet.name.length > 31 || /[\\/?*:[\]]/.test(sheet.name) || names.has(sheet.name.toLocaleLowerCase())) throw Error('Invalid signature register sheet name.');
    names.add(sheet.name.toLocaleLowerCase());
  }
  validate(sheets.flatMap(sheet => sheet.rows));
}
module.exports = { fields, headers, normalize, parseRows, reindex, validate, validateSheets };
