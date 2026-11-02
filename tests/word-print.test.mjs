import { test } from 'node:test';
import assert from 'node:assert/strict';
import { printPageStyles } from '../src/word/printDocument.ts';

test('print page rules preserve portrait and landscape dimensions and reuse equal sizes', () => {
  const styles = printPageStyles([
    { width: 794, height: 1123 },
    { width: 794, height: 1123 },
    { width: 1123, height: 794 },
  ]);
  assert.equal((styles.match(/@page /g) || []).length, 2);
  assert.match(styles, /\.docx-print-page-0\{page:docx-page-0;width:210\.08mm!important;height:297\.13mm!important\}/);
  assert.match(styles, /\.docx-print-page-2\{page:docx-page-1;width:297\.13mm!important;height:210\.08mm!important\}/);
  assert.match(styles, /\.docx-page:last-child\{break-after:auto!important;page-break-after:auto!important\}/);
});
