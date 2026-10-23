const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const ExcelJS = require('exceljs');
const signature = require('./signature.cjs');

function cellText(value) {
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  if (value && typeof value === 'object') return cellText(value.text ?? value.result ?? value.richText?.map(part => part.text).join('') ?? '');
  return String(value ?? '');
}
function worksheetRows(sheet) {
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, row => {
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => { values[column - 1] = cellText(cell.value); });
    rows.push(values);
  });
  return rows;
}
function registerRows(sheet) {
  const rows = worksheetRows(sheet);
  for (let index = 0; index < rows.length; index++) {
    const parsed = signature.parseRows(rows.slice(index));
    if (parsed) return parsed.map(row => ({ ...row, id: `signature-${randomUUID()}` }));
  }
  return null;
}
async function readWorkbook(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.xlsx') throw Error('Choose a valid .xlsx workbook.');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheets = [], sourceMap = {};
  for (const worksheet of workbook.worksheets) {
    const rows = registerRows(worksheet);
    if (!rows) continue;
    const id = `signature-sheet-${randomUUID()}`;
    sheets.push({ id, name: worksheet.name, rows });
    sourceMap[id] = worksheet.name;
  }
  if (!sheets.length) throw Error('No signature authentication register was found in this workbook.');
  return { file, sheets, sourceMap };
}
function addRegisterSheets(workbook, sheets) {
  sheets.forEach((register, index) => {
    const worksheet = workbook.addWorksheet(register.name);
    const rows = signature.reindex(register.rows).map(row => signature.fields.map(field => {
      if ((field === 'copies' || field === 'fee') && row[field]) return Number(row[field].replaceAll(',', ''));
      if (field === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(row.date)) return new Date(Number(row.date.slice(0, 4)), Number(row.date.slice(5, 7)) - 1, Number(row.date.slice(8, 10)));
      return row[field];
    }));
    worksheet.addTable({ name: `SignatureRegister${index + 1}_${Date.now()}`, ref: 'A1', headerRow: true, totalsRow: false, style: { theme: 'TableStyleLight15', showRowStripes: true }, columns: signature.headers.map(name => ({ name })), rows });
    worksheet.columns = signature.headers.map((header, column) => ({ width: Math.max(14, Math.min(column === 2 ? 48 : column === 3 ? 42 : 32, Math.max(header.length, ...rows.map(row => String(row[column] ?? '').length)) + 2)) }));
    worksheet.eachRow({ includeEmpty: false }, row => {
      row.font = { name: 'Times New Roman', size: 12, bold: row.number === 1 };
      row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      row.eachCell({ includeEmpty: true }, cell => { cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; });
      row.height = Math.min(240, Math.max(24, ...row.values.slice(1).map((value, column) => Math.ceil(String(value ?? '').length / (worksheet.columns[column].width * 1.15) * 16 + 8))));
    });
    worksheet.getColumn(2).numFmt = 'm/d/yyyy';
    worksheet.getColumn(6).numFmt = '0';
    worksheet.getColumn(7).numFmt = '#,##0';
  });
}
async function writeWorkbook(file, sheets) {
  signature.validateSheets(sheets);
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.xlsx') throw Error('Choose a valid .xlsx workbook.');
  const workbook = new ExcelJS.Workbook();
  addRegisterSheets(workbook, sheets);
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp.xlsx`);
  try { await workbook.xlsx.writeFile(temp); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
async function createWorkbook(file, sheets) {
  if (fs.existsSync(file)) throw Error('A file already exists at that location.');
  await writeWorkbook(file, sheets);
}
async function saveWorkbook(file, sheets, sourceMap) {
  signature.validateSheets(sheets);
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.xlsx' || !fs.statSync(file).isFile()) throw Error('The imported workbook is no longer available.');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const originalNames = new Set(Object.values(sourceMap));
  for (const name of originalNames) { const sheet = workbook.getWorksheet(name); if (sheet) workbook.removeWorksheet(sheet.id); }
  addRegisterSheets(workbook, sheets);
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp.xlsx`);
  try { await workbook.xlsx.writeFile(temp); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
module.exports = { readWorkbook, createWorkbook, saveWorkbook };
