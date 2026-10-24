const fields = ['refNo', 'customer', 'description', 'quantity', 'unitPrice'];
const headers = ['STT', 'SCT', 'Tên khách hàng', 'Nội dung', 'SL', 'Đơn', 'Thành tiền'];
const title = 'BẢNG KÊ CHỨNG THỰC BẢN SAO TỪ BẢN CHÍNH - KHÁCH LẺ';
const address = 'Số 105, Đường Hưng Đạo Vương, Kp. Nam Hà, Phường Trấn Biên, Tp. Đồng Nai';
const inWords = 'Bằng chữ: Tám mươi ngàn đồng';
const invoice = 'HĐ:________';
const supplier = 'Người cung cấp hàng hóa, dịch vụ';
const signature = '(Ký, ghi rõ họ tên)';
function today() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function normalize(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
function toInteger(value, field) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(raw)) throw Error(`${field} must be a whole number.`);
  const number = Number(raw.replaceAll(',', ''));
  if (!Number.isSafeInteger(number)) throw Error(`${field} must be a whole number.`);
  return String(number);
}
function total(row) { return row.manualTotal ? Number(row.totalAmount || 0) : Math.ceil(Number(row.quantity || 0) / 2) * Number(row.unitPrice || 0); }
function validateSheets(sheets) {
  if (!Array.isArray(sheets) || !sheets.length || sheets.length > 255) throw Error('Invalid copies register sheets.');
  const names = new Set(), ids = new Set();
  for (const sheet of sheets) {
    const name = typeof sheet?.name === 'string' ? sheet.name.trim() : '';
    if (!sheet || typeof sheet.id !== 'string' || !sheet.id || ids.has(sheet.id) || !name || name.length > 31 || /[\\/?*:[\]]/.test(name) || names.has(name.toLocaleLowerCase())) throw Error('Invalid copies register sheet name.');
    ids.add(sheet.id); names.add(name.toLocaleLowerCase());
    const dateParts = typeof sheet.date === 'string' && sheet.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = dateParts ? new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]))) : null;
    if (!date || date.getUTCFullYear() !== Number(dateParts[1]) || date.getUTCMonth() + 1 !== Number(dateParts[2]) || date.getUTCDate() !== Number(dateParts[3]) || !Array.isArray(sheet.rows) || sheet.rows.length > 100000 || (sheet.title != null && (typeof sheet.title !== 'string' || sheet.title.length > 20000)) || (sheet.address != null && (typeof sheet.address !== 'string' || sheet.address.length > 20000))) throw Error('Invalid copies register data.');
    const rowIds = new Set();
    for (const row of sheet.rows) {
      if (!row || typeof row.id !== 'string' || !row.id || rowIds.has(row.id)) throw Error('Invalid copies register data.');
      rowIds.add(row.id);
      for (const field of fields) if (typeof row[field] !== 'string' || row[field].length > 20000) throw Error('Invalid copies register data.');
      if (row.refNo && !/^\d+$/.test(row.refNo)) throw Error('Reference numbers must be whole numbers.');
      if (row.manualRefNo != null && typeof row.manualRefNo !== 'boolean') throw Error('Invalid reference number mode.');
      if (row.quantity && (!/^\d+$/.test(row.quantity) || !Number.isSafeInteger(Number(row.quantity)))) throw Error('Quantity must be a whole number.');
      if (row.unitPrice && (!/^\d+$/.test(row.unitPrice) || !Number.isSafeInteger(Number(row.unitPrice)))) throw Error('Unit price must be a whole number.');
      if (row.manualTotal != null && typeof row.manualTotal !== 'boolean') throw Error('Invalid total amount mode.');
      if (row.totalAmount != null && (typeof row.totalAmount !== 'string' || (row.totalAmount && (!/^\d+$/.test(row.totalAmount) || !Number.isSafeInteger(Number(row.totalAmount)))))) throw Error('Total amount must be a whole number.');
      if (row.manualTotal && !row.totalAmount) throw Error('Enter a manual total amount.');
      if (row.quantity && row.unitPrice && !Number.isSafeInteger(Math.ceil(Number(row.quantity) / 2) * Number(row.unitPrice))) throw Error('Total amount is outside the supported number range.');
    }
  }
  return sheets;
}
module.exports = { fields, headers, title, address, inWords, invoice, supplier, signature, today, normalize, toInteger, total, validateSheets };
