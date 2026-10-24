const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { headers } = require('../electron/translation.cjs');
const { readWorkbook, createWorkbook, saveWorkbook } = require('../electron/translation-workbook.cjs');

test('translation import accepts the shortened identity-document heading used by existing registers', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'translation-header-'));
  const file = path.join(dir, 'register.xlsx');
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('2026');
    sheet.addRow(headers.VI);
    sheet.getCell('C1').value = 'Họ tên, số Thẻ căn cước công dân/Thẻ căn cước, Căn cước điện tử/Giấy chứng nhận căn cước hoặc Hộ chiếu/giấy tờ có giá trị đi lại quốc';
    sheet.addRow(['1', '1/7/2026', 'TRẦN THU HẰNG - CCCD 123', 'Hộ chiếu', 'Việt - Anh', 'Công chứng viên', '01', 10000, '']);
    workbook.addWorksheet('Cover');
    await workbook.xlsx.writeFile(file);
    const imported = await readWorkbook(file);
    assert.equal(imported.sheets.length, 1);
    assert.equal(imported.sheets[0].rows.length, 1);
    assert.equal(imported.sheets[0].rows[0].person, 'TRẦN THU HẰNG - CCCD 123');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('translation import gives clear errors for workbooks without a register or valid xlsx data', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'translation-errors-'));
  const file = path.join(dir, 'unrelated.xlsx');
  const corrupt = path.join(dir, 'damaged.xlsx');
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Cover').getCell('A1').value = 'Not a register';
    await workbook.xlsx.writeFile(file);
    await assert.rejects(readWorkbook(file), /No translation register sheets were found.*9 required Translation columns/);
    fs.writeFileSync(corrupt, 'not an xlsx');
    await assert.rejects(readWorkbook(corrupt), /could not be read as an Excel \.xlsx workbook/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('translation import filters empty/extraneous rows and saves in place with dates, sizing, and other sheets preserved', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'translation-'));
  const file = path.join(dir, 'register.xlsx');
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Cover').getCell('A1').value = 'Keep me';
    const sheet = workbook.addWorksheet('2026');
    sheet.addRow(headers.VI);
    sheet.addRow(['1', new Date(2026, 0, 7), 'Original row', 'Passport', 'VI-EN', 'Signer', '1', 10000, '']);
    sheet.addRow(['2', new Date(2026, 0, 8), 'Updated full name', 'Passport', 'VI-EN', 'Signer', 2, 1000, '']);
    sheet.addRow(['3', new Date(2026, 0, 9), 'Third row', 'Passport', 'VI-EN', 'Signer', 3, 1000, '']);
    sheet.addRow([]);
    sheet.getCell('J4').value = 'extraneous only';
    for (let column = 1; column <= 10; column++) sheet.getRow(400).getCell(column).border = { bottom: { style: 'thin' } };
    await workbook.xlsx.writeFile(file);

    const imported = await readWorkbook(file);
    assert.equal(imported.sheets.length, 1);
    assert.equal(imported.sheets[0].rows.length, 3);
    assert.equal(imported.sheets[0].rows[0].date, '2026-01-07');
    imported.sheets[0].rows.splice(0, 1);
    imported.sheets[0].rows[0].person = 'Updated full name';
    await saveWorkbook(file, imported.sheets, imported.sourceMap);

    const saved = new ExcelJS.Workbook();
    await saved.xlsx.readFile(file);
    assert.equal(saved.getWorksheet('Cover').getCell('A1').value, 'Keep me');
    const savedRegister = saved.getWorksheet('2026');
    assert.equal(savedRegister.getCell('C1').value, headers.VI[2]);
    assert.equal(savedRegister.getCell('A2').value, 1);
    assert.equal(typeof savedRegister.getCell('A2').value, 'number');
    assert.equal(savedRegister.getCell('B2').value.getFullYear(), 2026);
    assert.equal(savedRegister.getCell('C2').value, 'Updated full name');
    assert.equal(typeof savedRegister.getCell('G2').value, 'number');
    assert.equal(savedRegister.getCell('G2').value, 2);
    assert.equal(typeof savedRegister.getCell('H2').value, 'number');
    assert.equal(savedRegister.getCell('H2').value, 1000);
    assert.equal(savedRegister.getCell('H2').numFmt, '#,##0');
    assert.equal(savedRegister.getCell('C2').alignment.horizontal, 'center');
    assert.equal(savedRegister.getCell('C2').alignment.vertical, 'middle');
    assert.equal(savedRegister.getCell('C2').border.left.style, 'thin');
    assert.ok(savedRegister.getColumn(3).width >= 'Updated full name'.length);
    assert.ok(savedRegister.getColumn(3).width <= 32);
    assert.equal(savedRegister.getCell('B2').numFmt, 'm/d/yyyy');
    assert.equal(Object.values(savedRegister.tables)[0].table.style.theme, 'TableStyleLight15');
    imported.sourceMap = Object.fromEntries(imported.sheets.map(register => [register.id, register.name]));
    imported.sheets[0].rows[0].person = 'Saved twice';
    await saveWorkbook(file, imported.sheets, imported.sourceMap);
    const savedAgain = new ExcelJS.Workbook();
    await savedAgain.xlsx.readFile(file);
    assert.equal(savedAgain.getWorksheet('2026').getCell('C2').value, 'Saved twice');
    savedAgain.getWorksheet('2026').getCell('C2').value = 'Updated externally';
    await savedAgain.xlsx.writeFile(file);
    const refreshed = await readWorkbook(file);
    assert.equal(refreshed.sheets[0].rows[0].person, 'Updated externally');
    const newFile = path.join(dir, 'new-register.xlsx');
    await createWorkbook(newFile, imported.sheets, 'VI');
    const created = new ExcelJS.Workbook();
    await created.xlsx.readFile(newFile);
    assert.equal(created.getWorksheet('2026').getCell('A2').value, 1);
    assert.equal(created.getWorksheet('2026').getCell('A1').value, headers.VI[0]);
    assert.equal(created.getWorksheet('2026').getCell('C1').value, headers.VI[2]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
