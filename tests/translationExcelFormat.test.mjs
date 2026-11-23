import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { applyTranslationExcelRules } from '../src/translationExcelFormat.ts';

test('Translation Excel formatting uppercases text and marks every duplicate STT row yellow', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('2026');
  sheet.addRow(['Serial number', 'Person', 'Notes']);
  sheet.addRow(['01', 'Nguyễn Văn A', 'first']);
  sheet.addRow(['1', 'Nguyen Van B', 'second']);
  sheet.addRow(['2', 'Not duplicated', { formula: '1+1' }]);
  sheet.getCell('B2').value = { richText: [{ text: 'Rich ' }, { text: 'text' }] };
  applyTranslationExcelRules(sheet, new Set([1]));

  assert.equal(sheet.getCell('A1').value, 'SERIAL NUMBER');
  assert.deepEqual(sheet.getCell('B2').value, { richText: [{ text: 'RICH ' }, { text: 'TEXT' }] });
  assert.equal(sheet.getCell('C4').value.formula, '1+1');
  applyTranslationExcelRules(sheet, new Set());
  assert.equal(sheet.conditionalFormattings.some(item => item.rules.some(rule => rule.formulae?.includes('N("B6H_DUPLICATE_STT")=0'))), false);
  applyTranslationExcelRules(sheet, new Set([1]));
  assert.equal(sheet.conditionalFormattings.filter(item => item.rules.some(rule => rule.formulae?.includes('N("B6H_DUPLICATE_STT")=0'))).length, 1);
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  const savedSheet = reopened.getWorksheet('2026');
  const duplicateRule = savedSheet.conditionalFormattings.flatMap(item => item.rules).find(rule => rule.formulae?.includes('N("B6H_DUPLICATE_STT")=0'));
  assert.ok(duplicateRule);
  assert.match(savedSheet.conditionalFormattings.find(item => item.rules.includes(duplicateRule)).ref, /A2:C2.*A3:C3|A3:C3.*A2:C2/);
  assert.equal(duplicateRule.style.fill.fgColor.argb, 'FFFFFF00');
});
