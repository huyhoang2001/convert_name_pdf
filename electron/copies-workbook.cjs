const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const ExcelJS = require('exceljs');
const copies = require('./copies.cjs');

function cellText(value) {
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  if (value && typeof value === 'object') return cellText(value.text ?? value.result ?? value.richText?.map(part => part.text).join('') ?? '');
  return String(value ?? '').trim();
}
function rowsOf(sheet) {
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, row => {
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => { values[column - 1] = cellText(cell.value); });
    rows.push(values);
  });
  return rows;
}
const aliases = [
  ['no', 'serial number', 'stt'], ['ref no', 'reference number', 'sct'], ['customer name', 'customer', 'ten khach hang'],
  ['description', 'content', 'noi dung'], ['quantity', 'qty', 'sl'], ['unit price', 'number of copies', 'copies', 'so ban sao', 'unit', 'don gia', 'don', 'đơn giá', 'đơn'], ['total amount', 'amount', 'thanh tien']
];
const headerKeys = ['number', 'refNo', 'customer', 'description', 'quantity', 'unitPrice', 'total'];
function headerIndexes(row, settings = {}) {
  const normalized = row.map(copies.normalize);
  const indexes = aliases.map((options, column) => normalized.findIndex(value => [settings[`header:${headerKeys[column]}`], ...options].filter(Boolean).some(option => value === copies.normalize(option))));
  return indexes.every(index => index >= 0) ? indexes : null;
}
function parseDate(value) {
  const text = String(value ?? '');
  const match = text.match(/(\d{1,2})\s*tháng\s*(\d{1,2})\s*năm\s*(\d{4})/i) || text.match(/(\d{1,2})\s*[/-]\s*(\d{1,2})\s*[/-]\s*(\d{4})/);
  return match ? `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}` : /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : copies.today();
}
function parseSheet(sheet, settings = {}) {
  const rows = rowsOf(sheet);
  const headerRow = rows.findIndex((row, index) => index < 20 && headerIndexes(row, settings));
  if (headerRow < 0) return null;
  const indexes = headerIndexes(rows[headerRow], settings);
  const custom = [...new Set(Object.keys(settings).map(key => key.match(/^custom:([a-f0-9-]{36}):label$/)?.[1]).filter(Boolean))].map(id => ({ id, index: rows[headerRow].findIndex(value => copies.normalize(value) === copies.normalize(settings[`custom:${id}:header`])) }));

  const records = rows.slice(headerRow + 1).filter(row => /^\d+$/.test(row[indexes[0]] ?? '')).map(row => ({
    id: `copy-${randomUUID()}`,
    refNo: copies.toInteger(row[indexes[1]], 'Reference number'), customer: row[indexes[2]] || '', description: row[indexes[3]] || '',
    quantity: copies.toInteger(row[indexes[4]], 'Quantity'), unitPrice: copies.toInteger(row[indexes[5]], 'Number of copies'), totalAmount: copies.toInteger(row[indexes[6]], 'Total amount'), ...Object.fromEntries(custom.map(field => [`custom:${field.id}`, row[field.index] || '']))
  })).filter(row => row.customer || row.description || row.quantity || row.unitPrice).map(row => ({
    ...row,
    manualTotal: Boolean(row.totalAmount && Number(row.totalAmount) !== Math.ceil(Number(row.quantity || 0) * Number(row.unitPrice || 0) / 2) * 10000)
  }));
  const title = cellText(sheet.getCell('A1').value) || copies.title;
  const address = cellText(sheet.getCell('A3').value || sheet.getCell('A4').value).replace(/^(?:Address|Địa chỉ):\s*/i, '') || copies.address;
  const date = parseDate(cellText(sheet.getCell('A2').value));
  return { id: `copies-sheet-${randomUUID()}`, name: sheet.name, title, address, date, rows: records };
}
async function readWorkbook(file, settings = {}) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.xlsx') throw Error('Choose a valid .xlsx workbook.');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheets = [], sourceMap = {};
  for (const worksheet of workbook.worksheets) {
    const sheet = parseSheet(worksheet, settings);
    if (sheet) { sheets.push(sheet); sourceMap[sheet.id] = worksheet.name; }
  }
  if (!sheets.length) throw Error('No copies register sheets were found.');
  copies.validateSheets(sheets);
  return { file, sheets, sourceMap };
}
function addSheets(workbook, sheets, settings = {}) {
  const custom = [...new Set(Object.keys(settings).map(key => key.match(/^custom:([a-f0-9-]{36}):label$/)?.[1]).filter(Boolean))];
  const headers = copies.headers.map((header, index) => settings[`header:${headerKeys[index]}`]?.trim() || header);
  headers.push(...custom.map(id => settings[`custom:${id}:header`]));
  sheets.forEach((register, index) => {
    const sheet = workbook.addWorksheet(register.name);
    sheet.columns = [...[8, 13, 30, 50, 13, 18, 20], ...custom.map(() => 28)].map(width => ({ width }));
    const lastCol = sheet.getColumn(headers.length).letter;
    sheet.mergeCells(`A1:${lastCol}1`); sheet.getCell('A1').value = register.title || copies.title;
    sheet.mergeCells(`A2:${lastCol}2`);
    const [year, month, day] = register.date.split('-');
    sheet.getCell('A2').value = `Ngày ${day} tháng ${month} năm ${year}`;
    sheet.mergeCells(`A3:${lastCol}3`); sheet.getCell('A3').value = `Địa chỉ: ${register.address || copies.address}`;
    sheet.mergeCells(`A4:${lastCol}4`); sheet.getCell('A4').value = 'Đơn vị tính: VNĐ';
    const data = register.rows.map((row, rowIndex) => [rowIndex + 1, Number(copies.toInteger(row.refNo, 'Reference number') || rowIndex + 1), row.customer, row.description,
      copies.toInteger(row.quantity, 'Quantity') === '' ? null : Number(copies.toInteger(row.quantity, 'Quantity')),
      copies.toInteger(row.unitPrice, 'Number of copies') === '' ? null : Number(copies.toInteger(row.unitPrice, 'Number of copies')),
      row.quantity && row.unitPrice ? copies.total(row) : null, ...custom.map(id => row[`custom:${id}`] ?? '')]);
    sheet.addTable({ name: `CopiesRegister${index + 1}_${Date.now()}`, ref: 'A5', headerRow: true, totalsRow: false, style: { theme: 'TableStyleLight15', showRowStripes: true }, columns: headers.map(name => ({ name })), rows: data });
    const totalRow = data.length + 6, wordsRow = totalRow + 1, invoiceRow = wordsRow + 1, signatureRow = invoiceRow + 1;
    sheet.mergeCells(`A${totalRow}:F${totalRow}`); sheet.getCell(`A${totalRow}`).value = 'Tổng cộng chứng thực bản sao';
    sheet.getCell(`G${totalRow}`).value = { formula: data.length ? `SUM(G6:G${data.length + 5})` : '0', result: data.reduce((sum, row) => sum + Number(row[6] || 0), 0) };
    sheet.mergeCells(`A${wordsRow}:${lastCol}${wordsRow}`); sheet.getCell(`A${wordsRow}`).value = copies.inWords;
    sheet.mergeCells(`A${invoiceRow}:C${invoiceRow}`); sheet.getCell(`A${invoiceRow}`).value = copies.invoice;
    sheet.mergeCells(`D${invoiceRow}:${lastCol}${invoiceRow}`); sheet.getCell(`D${invoiceRow}`).value = copies.supplier;
    sheet.mergeCells(`D${signatureRow}:${lastCol}${signatureRow}`); sheet.getCell(`D${signatureRow}`).value = copies.signature;
    sheet.eachRow({ includeEmpty: false }, row => {
      row.font = { name: 'Times New Roman', size: 12, bold: row.number === 1 || row.number === 5 || row.number >= totalRow };
      row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      if (row.number === 4) row.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
      if (row.number === totalRow) row.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      row.eachCell({ includeEmpty: true }, cell => { cell.border = { top: { style: 'thin', color: { argb: 'FFD9E0E8' } }, left: { style: 'thin', color: { argb: 'FFD9E0E8' } }, bottom: { style: 'thin', color: { argb: 'FFD9E0E8' } }, right: { style: 'thin', color: { argb: 'FFD9E0E8' } } }; });
      row.height = row.number === 1 ? 30 : row.number === 5 ? 36 : Math.max(24, Math.ceil(Math.max(...row.values.slice(1).map(value => String(value ?? '').length), 1) / 55) * 18);
    });
    sheet.getColumn(2).numFmt = '0'; sheet.getColumn(5).numFmt = '0'; sheet.getColumn(6).numFmt = '#,##0'; sheet.getColumn(7).numFmt = '#,##0';
  });
}
async function replaceWorkbookFile(temp, file) {
  try { fs.renameSync(temp, file); }
  catch (error) {
    if (['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) {
      if (fs.existsSync(file)) {
        const extension = path.extname(file), stem = file.slice(0, -extension.length);
        for (let index = 1; ; index++) {
          const alternate = `${stem} (${index})${extension}`;
          if (!fs.existsSync(alternate)) { fs.renameSync(temp, alternate); return alternate; }
        }
      }
      throw Error('The workbook could not be saved. Check that you have permission to write to this folder.');
    }
    throw error;
  }
  return file;
}
async function writeWorkbook(file, sheets, settings = {}) {
  copies.validateSheets(sheets);
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.xlsx') throw Error('Choose a valid .xlsx workbook.');
  const workbook = new ExcelJS.Workbook(); addSheets(workbook, sheets, settings);
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp.xlsx`);
  let savedFile;
  try { await workbook.xlsx.writeFile(temp); savedFile = await replaceWorkbookFile(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return savedFile;
}
async function createWorkbook(file, sheets, settings) { if (fs.existsSync(file)) throw Error('A file already exists at that location.'); return writeWorkbook(file, sheets, settings); }
async function saveWorkbook(file, sheets, sourceMap, settings) {
  copies.validateSheets(sheets);
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.xlsx' || !fs.statSync(file).isFile()) throw Error('The imported workbook is no longer available.');
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(file);
  const originals = new Set(Object.values(sourceMap));
  const protectedNames = new Set(workbook.worksheets.filter(sheet => !originals.has(sheet.name)).map(sheet => sheet.name.toLocaleLowerCase()));
  if (sheets.some(sheet => protectedNames.has(sheet.name.toLocaleLowerCase()))) throw Error('A sheet name conflicts with an unrelated sheet in the workbook. Rename the copies sheet and try again.');
  for (const name of originals) { const sheet = workbook.getWorksheet(name); if (sheet) workbook.removeWorksheet(sheet.id); }
  addSheets(workbook, sheets, settings);
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp.xlsx`);
  try { await workbook.xlsx.writeFile(temp); await replaceWorkbookFile(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return sheets.length;
}
module.exports = { readWorkbook, createWorkbook, saveWorkbook, writeWorkbook };
