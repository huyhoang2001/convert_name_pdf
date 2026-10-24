const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const ExcelJS = require('exceljs');
const translation = require('./translation.cjs');

function cellText(value) {
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  if (typeof value === 'string') { const match = value.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); if (match) return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`; }
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

function parseRegisterSheet(sheet) {
  const rows = worksheetRows(sheet);
  for (let start = 0; start < rows.length; start++) {
    const parsed = translation.fromRowsIfRegister(rows.slice(start));
    if (parsed) return parsed;
  }
  return null;
}

async function loadWorkbook(file) {
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.readFile(file); }
  catch (error) {
    if (['EACCES', 'EPERM', 'EBUSY'].includes(error.code)) throw Error('Could not read the Excel file. Close it in Excel and check your file permissions.');
    if (error.code === 'ENOENT') throw Error('The selected Excel file could not be found. Select it again.');
    throw Error('This file could not be read as an Excel .xlsx workbook. It may be damaged, password-protected, or saved in an unsupported format.');
  }
  return workbook;
}

async function readWorkbook(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.xlsx') throw Error('Choose a valid .xlsx workbook.');
  const workbook = await loadWorkbook(file);
  const sheets = [], sourceMap = {};
  for (const worksheet of workbook.worksheets) {
    const rows = parseRegisterSheet(worksheet);
    if (!rows) continue;
    const id = `import-${randomUUID()}`;
    sheets.push({ id, name: worksheet.name, rows: rows.map(row => ({ ...row, id: `row-${randomUUID()}` })) });
    sourceMap[id] = worksheet.name;
  }
  if (!sheets.length) throw Error('No translation register sheets were found. Check that the workbook contains all 9 required Translation columns.');
  return { file, sheets, sourceMap };
}

function addRegisterSheets(workbook, sheets, language = 'VI') {
  const headers = [...translation.headers[language]];
  sheets.forEach((register, index) => {
    const worksheet = workbook.addWorksheet(register.name);
    const rows = register.rows.map((row, rowIndex) => translation.fields.map(field => {
      if (field === 'number') return rowIndex + 1;
      if (field === 'fee' || field === 'copies') return translation.toInteger(row[field], field === 'fee' ? 'Certification fee' : 'Certified copy count');
      if (field === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(row.date)) return new Date(Number(row.date.slice(0, 4)), Number(row.date.slice(5, 7)) - 1, Number(row.date.slice(8, 10)));
      return row[field];
    }));
    worksheet.addTable({ name: `TranslationRegister${index + 1}_${Date.now()}`, ref: 'A1', headerRow: true, totalsRow: false, style: { theme: 'TableStyleLight15', showRowStripes: true }, columns: headers.map(name => ({ name })), rows });
    worksheet.columns = headers.map((header, column) => {
      const maxWidth = column === 2 ? 32 : column === 6 ? 28 : 60;
      return { width: Math.max(14, Math.min(maxWidth, Math.max(column === 2 || column === 6 ? 10 : header.length, ...rows.map(row => String(row[column] ?? '').length)) + 2)) };
    });
    worksheet.eachRow({ includeEmpty: false }, row => {
      row.font = { name: 'Times New Roman', size: 12, bold: row.number === 1 };
      row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      row.eachCell({ includeEmpty: true }, cell => { cell.border = { top: { style: 'thin', color: { argb: 'FFD9E0E8' } }, left: { style: 'thin', color: { argb: 'FFD9E0E8' } }, bottom: { style: 'thin', color: { argb: 'FFD9E0E8' } }, right: { style: 'thin', color: { argb: 'FFD9E0E8' } } }; });
      const lines = row.values.slice(1).reduce((max, value, index) => Math.max(max, String(value ?? '').split('\n').reduce((total, part) => total + Math.max(1, Math.ceil(part.length / (worksheet.columns[index].width * 1.15))), 0)), 1);
      row.height = Math.min(240, Math.max(24, lines * 16 + 8));
    });
    worksheet.getColumn(2).numFmt = 'm/d/yyyy';
    worksheet.getColumn(7).numFmt = '0';
    worksheet.getColumn(8).numFmt = '#,##0';
  });
}

async function writeWorkbook(file, sheets, language = 'VI') {
  translation.validateSheets(sheets);
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.xlsx') throw Error('Choose a valid .xlsx file.');
  const workbook = new ExcelJS.Workbook();
  addRegisterSheets(workbook, sheets, language);
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp.xlsx`);
  try { await workbook.xlsx.writeFile(temp); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return sheets.length;
}

async function createWorkbook(file, sheets, language) {
  if (fs.existsSync(file)) throw Error('A file already exists at that location.');
  return writeWorkbook(file, sheets, language);
}

async function saveWorkbook(file, sheets, sourceMap = {}, language) {
  translation.validateSheets(sheets);
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.xlsx' || !fs.statSync(file).isFile()) throw Error('The imported workbook is no longer available.');
  const workbook = await loadWorkbook(file);
  const originalNames = new Set(Object.values(sourceMap));
  const protectedNames = new Set(workbook.worksheets.filter(sheet => !originalNames.has(sheet.name)).map(sheet => sheet.name.toLocaleLowerCase()));
  if (sheets.some(sheet => protectedNames.has(sheet.name.toLocaleLowerCase()))) throw Error('A sheet name conflicts with an unrelated sheet in the workbook. Rename the translation sheet and try again.');
  for (const originalName of originalNames) { const sheet = workbook.getWorksheet(originalName); if (sheet) workbook.removeWorksheet(sheet.id); }
  addRegisterSheets(workbook, sheets, language);
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp.xlsx`);
  try { await workbook.xlsx.writeFile(temp); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return sheets.length;
}

module.exports = { readWorkbook, createWorkbook, saveWorkbook };
