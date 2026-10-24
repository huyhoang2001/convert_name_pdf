const fields = ['number', 'date', 'person', 'document', 'languages', 'certifier', 'copies', 'fee', 'notes'];
const headers = {
  EN: ["Serial / certification number","Certification date","Full name and number of Citizen Identity Card/Identity Card/Electronic Identity/Certificate of Identity or Passport/immigration or international travel document","Translated document name","Translated from / to","Certifying signer and title","Number of certified translated copies","Certification fee","Notes"],
  VI: ['Số thứ tự / số chứng thực', 'Ngày tháng năm chứng thực', 'Họ tên, số Thẻ căn cước công dân/Thẻ căn cước/Căn cước điện tử/Giấy chứng nhận căn cước hoặc Hộ chiếu/giấy tờ xuất nhập cảnh/giấy tờ có giá trị đi lại quốc tế', 'Tên của giấy tờ, văn bản đã được dịch', 'Dịch từ tiếng sang tiếng', 'Họ tên, chức danh người ký chứng thực', 'Số lượng bản dịch đã được chứng thực chữ ký', 'Phí chứng thực', 'Ghi chú']
};
function normalizeHeader(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
function toInteger(value, field) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(raw)) throw Error(`${field} must be a whole number.`);
  const text = raw.replaceAll(',', '');
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) throw Error(`${field} must be a whole number.`);
  return Number(text);
}
function fromRows(rows) {
  const h = rows[0] || [];
  const indexes = fields.map((field, i) => {
    const shortPersonHeaders = field === 'person' ? ['Enter information', 'Nhập thông tin'] : [];
    const expected = [headers.EN[i], headers.VI[i], field, ...shortPersonHeaders].map(normalizeHeader);
    return [field, h.findIndex(value => {
      const actual = normalizeHeader(value);
      const matches = expected.some(header => actual === header || (Math.min(actual.length, header.length) >= 32 && (actual.startsWith(header) || header.startsWith(actual))));
      return matches || (field === 'person' && ['ho ten', 'can cuoc', 'ho chieu'].every(part => actual.includes(part)));
    })];
  });
  if (indexes.some(([, index]) => index < 0)) throw Error('Import file must contain all 9 translation register columns.');
  return rows.slice(1).filter(row => indexes.some(([field, index]) => field !== 'number' && String(row[index] ?? '').trim())).map((row, i) => Object.fromEntries([['id', `import-${Date.now()}-${i}`], ...indexes.map(([field, index]) => [field, String(row[index] ?? '')])]));
}
function fromRowsIfRegister(rows) {
  try { return fromRows(rows); }
  catch (error) { if (error.message === 'Import file must contain all 9 translation register columns.') return null; throw error; }
}
function validate(records) {
  if (!Array.isArray(records) || records.length > 100000) throw Error('Invalid translation register data.');
  const ids = new Set();
  for (const record of records) {
    if (!record || typeof record.id !== 'string' || !record.id || ids.has(record.id) || fields.some(field => typeof record[field] !== 'string' || record[field].length > 20000)) throw Error('Invalid translation register data.');
    ids.add(record.id);
  }
  return records;
}
function loadSheets(data) {
  if (Array.isArray(data) && data.length && Array.isArray(data[0]?.rows)) return validateSheets(data);
  if (Array.isArray(data)) return [{ id: 'default', name: 'D\u1ecbch thu\u1eadt', rows: validate(data) }];
  return validateSheets(data);
}
function validateSheets(sheets) {
  if (!Array.isArray(sheets) || !sheets.length || sheets.length > 100) throw Error('Invalid translation sheets.');
  const ids = new Set(), names = new Set();
  for (const sheet of sheets) {
    const key = typeof sheet?.name === 'string' ? sheet.name.trim().toLocaleLowerCase() : '';
    if (!sheet || typeof sheet.id !== 'string' || !sheet.id || ids.has(sheet.id) || !key || key.length > 31 || /[\\/?*:[\]]/.test(key) || names.has(key)) throw Error('Invalid translation sheet name.');
    ids.add(sheet.id); names.add(key); validate(sheet.rows);
  }
  return sheets;
}
module.exports = { fields, headers, fromRows, fromRowsIfRegister, toInteger, validate, loadSheets, validateSheets };
