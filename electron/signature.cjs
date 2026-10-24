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
const headerKeys = ['signatureHeaderNumber','signatureHeaderDate','signatureHeaderPerson','signatureHeaderDocument','signatureHeaderSigner','signatureHeaderCount','signatureHeaderFee','signatureHeaderNotes'];
const vietnameseAppHeaders = ['Số Chứng thực/Số thứ tự','Ngày chứng thực','Họ tên, số Thẻ căn cước công dân/Thẻ căn cước/Căn cước điện tử/Giấy chứng nhận căn cước hoặc Hộ chiếu/giấy tờ xuất nhập cảnh/giấy tờ có giá trị đi lại quốc tế','Tên giấy tờ/văn bản được chứng thực chữ ký/điểm chỉ','Họ tên, chức danh người ký chứng thực','Số lượng giấy tờ/văn bản được chứng thực chữ ký/điểm chỉ','Phí chứng thực','Ghi chú'];
const englishHeaders = ['Serial / certification number','Attestation date','Full name and number of Citizen Identity Card/ID Card/Electronic Identity/Identity Certificate or Passport/immigration or international travel document','Name of the documents/papers with certified signatures/fingerprints','Name and title of certifying signer','Number of documents/papers with certified signatures/fingerprints','Certification fee','Notes'];
function columns(settings = {}, language = 'VI') {
  const base = fields.map((key, index) => ({ key, header: settings[`header:${headerKeys[index]}`]?.trim() || (language === 'EN' ? englishHeaders[index] : vietnameseAppHeaders[index]), aliases: [headers[index], vietnameseAppHeaders[index], englishHeaders[index], settings[`header:${headerKeys[index]}`]].filter(Boolean) }));
  const ids = [...new Set(Object.keys(settings).map(key => key.match(/^custom:([a-f0-9-]{36}):label$/)?.[1]).filter(Boolean))];
  const result = [...base, ...ids.map(id => ({ key: `custom:${id}`, header: settings[`custom:${id}:header`]?.trim() || settings[`custom:${id}:label`], aliases: [settings[`custom:${id}:header`], settings[`custom:${id}:label`]].filter(Boolean) }))];
  if (new Set(result.map(column => column.header.trim().toLocaleLowerCase())).size !== result.length) throw Error('Signature register headers must be unique.');
  return result;
}
function normalize(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
function parseRows(rows, settings = {}, language = 'VI') {
  const allColumns = columns(settings, language);
  const indexes = allColumns.map(column => rows[0]?.findIndex(value => column.aliases.some(alias => {
    const actual = normalize(value), expected = normalize(alias);
    return actual === expected || (Math.min(actual.length, expected.length) >= 32 && (actual.startsWith(expected) || expected.startsWith(actual)));
  })) ?? -1);
  if (indexes.slice(0, fields.length).some(index => index < 0)) return null;
  return rows.slice(1).filter(row => indexes.slice(1).some(index => index >= 0 && String(row[index] ?? '').trim())).map((row, index) => Object.fromEntries([
    ['id', `signature-import-${Date.now()}-${index}`],
    ...allColumns.map((column, columnIndex) => [column.key, String(indexes[columnIndex] < 0 ? '' : row[indexes[columnIndex]] ?? '')])
  ]));
}
function reindex(rows) { return rows.map((row, index) => ({ ...row, number: String(index + 1).padStart(2, '0') })); }
function validate(rows, settings = {}, language = 'VI') {
  if (!Array.isArray(rows) || rows.length > 100000) throw Error('Invalid signature register data.');
  const ids = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw Error('Invalid signature register data.');
    ids.add(row.id);
    for (const { key: field } of columns(settings, language).slice(1, fields.length)) if (typeof row[field] !== 'string' || row[field].length > 20000) throw Error('Invalid signature register data.');
    for (const { key: field } of columns(settings, language).slice(fields.length)) if (row[field] !== undefined && (typeof row[field] !== 'string' || row[field].length > 20000)) throw Error('Invalid signature register data.');
    if (row.copies && !/^\d+$/.test(row.copies)) throw Error('Document count must be a whole number.');
    if (row.fee && (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(row.fee) || !Number.isSafeInteger(Number(row.fee.replaceAll(',', ''))))) throw Error('Certification fee must be a whole number.');
  }
}
function validateSheets(sheets, settings = {}, language = 'VI') {
  if (!Array.isArray(sheets) || !sheets.length || sheets.length > 255) throw Error('Invalid signature register sheets.');
  const names = new Set();
  for (const sheet of sheets) {
    if (!sheet || typeof sheet.id !== 'string' || !sheet.id || typeof sheet.name !== 'string' || !sheet.name.trim() || sheet.name.length > 31 || /[\\/?*:[\]]/.test(sheet.name) || names.has(sheet.name.toLocaleLowerCase())) throw Error('Invalid signature register sheet name.');
    names.add(sheet.name.toLocaleLowerCase());
  }
  validate(sheets.flatMap(sheet => sheet.rows), settings, language);
}
module.exports = { fields, headers, headerKeys, columns, normalize, parseRows, reindex, validate, validateSheets };
