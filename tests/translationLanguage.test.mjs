import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { conciseTranslationLanguage, conciseTranslationLanguagePair } from '../src/translationLanguage.mjs';

test('concise language pair normalization handles every Translation selector language and legacy prefixes', () => {
  for (const [input, expected] of [
    ['Tiếng Việt - Tiếng Anh', 'Việt - Anh'],
    ['English -> Vietnamese', 'Anh - Việt'],
    ['Chinese - Vietnamese', 'Hoa - Việt'],
    ['Tiếng Việt - Tiếng Nhật', 'Việt - Nhật'],
    ['Korean - French', 'Hàn - Pháp'],
    ['Tiếng tiếng Việt - Tiếng Tiếng Anh', 'Việt - Anh'],
  ]) assert.equal(conciseTranslationLanguagePair(input), expected);
  assert.equal(conciseTranslationLanguage('Tiếng Trung'), 'Hoa');
  assert.equal(conciseTranslationLanguage('Japanese'), 'Nhật');
  assert.equal(conciseTranslationLanguagePair('Vietnamese - Unknown dialect'), 'Vietnamese - Unknown dialect');
});

test('concise language pair survives an Excel save and reopen', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('2026');
  sheet.addRow(['STT', 'Dịch từ tiếng sang tiếng']);
  sheet.addRow(['01', conciseTranslationLanguagePair('Tiếng Việt - Tiếng Anh')]);
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.equal(reopened.getWorksheet('2026').getCell('B2').value, 'Việt - Anh');
});
