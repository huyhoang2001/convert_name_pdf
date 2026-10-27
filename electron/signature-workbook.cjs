const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const ExcelJS = require('exceljs');
const signature = require('./signature.cjs');
const { longestLine, fitAndBorder } = require('./register-format.cjs');

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
function registerRows(sheet, settings, language) {
  const rows = worksheetRows(sheet);
  for (let index = 0; index < rows.length; index++) {
    const parsed = signature.parseRows(rows.slice(index), settings, language);
    if (parsed) return parsed.map(row => ({ ...row, id: `signature-${randomUUID()}` }));
  }
  return null;
}
async function readWorkbook(file, settings = {}, language = 'VI') {
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.xlsx') throw Error('Choose a valid .xlsx workbook.');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheets = [], sourceMap = {};
  for (const worksheet of workbook.worksheets) {
    const rows = registerRows(worksheet, settings, language);
    if (!rows) continue;
    const id = `signature-sheet-${randomUUID()}`;
    sheets.push({ id, name: worksheet.name, rows });
    sourceMap[id] = worksheet.name;
  }
  if (!sheets.length) throw Error('No signature authentication register was found in this workbook.');
  return { file, sheets, sourceMap };
}
function addRegisterSheets(workbook, sheets, settings = {}, language = 'VI') {
  const columns = signature.columns(settings, language);
  sheets.forEach((register, index) => {
    const worksheet = workbook.addWorksheet(register.name);
    const rows = signature.reindex(register.rows).map(row => columns.map(({ key }) => {
      const value = row[key] ?? '';
      if ((key === 'copies' || key === 'fee') && value) return Number(value.replaceAll(',', ''));
      if (key === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)));
      return value;
    }));
    worksheet.addTable({ name: `SignatureRegister${index + 1}_${Date.now()}`, ref: 'A1', headerRow: true, totalsRow: false, style: { theme: 'TableStyleLight15', showRowStripes: true }, columns: columns.map(({ header }) => ({ name: header })), rows });
    worksheet.columns = columns.map(({ header, key }, column) => ({ width: Math.min(key === 'person' ? 48 : key === 'document' ? 42 : 32, Math.max(14, rows.reduce((max, row) => Math.max(max, longestLine(row[column])), longestLine(header)) + 2)) }));
    worksheet.eachRow({ includeEmpty: false }, row => {
      row.font = { name: 'Times New Roman', size: 12, bold: row.number === 1 };
      row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    fitAndBorder(worksheet, rows.length + 1, columns.length);
    columns.forEach(({ key }, column) => { if (key === 'date') worksheet.getColumn(column + 1).numFmt = 'm/d/yyyy'; if (key === 'copies') worksheet.getColumn(column + 1).numFmt = '0'; if (key === 'fee') worksheet.getColumn(column + 1).numFmt = '#,##0'; });
  });
}
async function writeWorkbook(file, sheets, settings = {}, language = 'VI') {
  signature.validateSheets(sheets, settings, language);
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.xlsx') throw Error('Choose a valid .xlsx workbook.');
  const workbook = new ExcelJS.Workbook();
  addRegisterSheets(workbook, sheets, settings, language);
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp.xlsx`);
  try { await workbook.xlsx.writeFile(temp); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
async function createWorkbook(file, sheets, settings = {}, language = 'VI') {
  if (fs.existsSync(file)) throw Error('A file already exists at that location.');
  await writeWorkbook(file, sheets, settings, language);
}
async function saveWorkbook(file, sheets, sourceMap, settings = {}, language = 'VI') {
  signature.validateSheets(sheets, settings, language);
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.xlsx' || !fs.statSync(file).isFile()) throw Error('The imported workbook is no longer available.');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const originalNames = new Set(Object.values(sourceMap));
  for (const name of originalNames) { const sheet = workbook.getWorksheet(name); if (sheet) workbook.removeWorksheet(sheet.id); }
  addRegisterSheets(workbook, sheets, settings, language);
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp.xlsx`);
  try { await workbook.xlsx.writeFile(temp); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
module.exports = { readWorkbook, createWorkbook, saveWorkbook };
