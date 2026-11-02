import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { applyRegisterExcelFormatting } from '../src/registerExcelFormat.ts';

test('register Excel formatting uses 14-point wrapped text and sizes rows for long content', () => {
  const sheet = new ExcelJS.Workbook().addWorksheet('Register');
  sheet.columns = [{ width: 14 }, { width: 14 }];
  sheet.addRow(['Header', 'Notes']);
  sheet.addRow(['Short', 'A long note that wraps to several lines when the workbook is opened.']);

  applyRegisterExcelFormatting(sheet);

  assert.equal(sheet.getRow(1).font.size, 14);
  assert.equal(sheet.getRow(2).font.size, 14);
  assert.equal(sheet.getCell('B2').alignment.wrapText, true);
  assert.ok(sheet.getRow(2).height > sheet.getRow(1).height);
  assert.equal(sheet.getTables().length, 0);
});

test('long register headers wrap within a bounded column width', () => {
  const sheet = new ExcelJS.Workbook().addWorksheet('Register');
  sheet.columns = [{ width: 80 }];
  sheet.addRow(['A deliberately long register header '.repeat(5)]);
  sheet.addRow(['Short value']);

  applyRegisterExcelFormatting(sheet);

  assert.equal(sheet.getColumn(1).width, 40);
  assert.equal(sheet.getCell('A1').alignment.wrapText, true);
  assert.ok(sheet.getRow(1).height > sheet.getRow(2).height);
});

test('formatting uses the full actual matrix even when the first row is merged', () => {
  const sheet = new ExcelJS.Workbook().addWorksheet('Register');
  sheet.mergeCells('A1:G1');
  sheet.getCell('A1').value = 'Register';
  sheet.getCell('A2').value = 'No.';
  sheet.getCell('G2').value = 'Notes';
  sheet.getCell('G3').value = 'A long note that belongs to the final used column.';
  sheet.getColumn(7).width = 14;

  applyRegisterExcelFormatting(sheet);

  assert.equal(sheet.actualRowCount, 3);
  assert.equal(sheet.actualColumnCount, 7);
  assert.equal(sheet.getCell('G3').font.size, 14);
  assert.equal(sheet.getCell('G3').alignment.wrapText, true);
  assert.ok(sheet.getRow(3).height > sheet.getRow(2).height);
  assert.equal(sheet.getTables().length, 0);
});
