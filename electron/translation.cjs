const fields = ['number', 'date', 'person', 'document', 'languages', 'certifier', 'copies', 'fee', 'notes'];
const headers = {
  EN: ['No. / certification number', 'Certification date', 'Full name and ID/passport', 'Translated document', 'Translated from / to', 'Certifying signer and title', 'Certified translation copies', 'Certification fee', 'Notes'],
  VI: ['Số thứ tự / số chứng thực', 'Ngày tháng năm chứng thực', 'Họ tên, số Thẻ căn cước công dân/Thẻ căn cước, Căn cước điện tử/Giấy chứng nhận căn cước hoặc Hộ chiếu/giấy tờ có giá trị đi lại quốc tế', 'Tên của giấy tờ, văn bản đã được dịch', 'Dịch từ tiếng sang tiếng', 'Họ tên, chức danh người ký chứng thực', 'Số lượng bản dịch đã được chứng thực chữ ký', 'Phí chứng thực', 'Ghi chú']
};
function fromRows(rows) {
  const h = rows[0] || [];
  const indexes = fields.map((field, i) => [field, h.findIndex(v => [headers.EN[i], headers.VI[i], field].includes(String(v ?? '').trim()))]);
  if (indexes.some(([, index]) => index < 0)) throw Error('Import file must contain all 9 translation register columns.');
  return rows.slice(1).filter(row => row.some(value => String(value ?? '').trim())).map((row, i) => Object.fromEntries([['id', `import-${Date.now()}-${i}`], ...indexes.map(([field, index]) => [field, String(row[index] ?? '')])]));
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
module.exports = { fields, headers, fromRows, validate };
