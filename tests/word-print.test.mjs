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
  assert.match(styles, /@page\{size:795px 1124px;margin:0\}/);
  assert.match(styles, /@page docx-page-0\{size:795px 1124px;margin:0\}/);
  assert.match(styles, /\.docx-print-page-0\{page:docx-page-0;width:794px!important;height:1123px!important\}/);
  assert.match(styles, /\.docx-print-page-2\{page:docx-page-1;width:1123px!important;height:794px!important\}/);
  assert.match(styles, /\.docx-print-root\{display:block!important;position:static!important/);
  assert.match(styles, /\.docx-page\{box-sizing:border-box!important;display:block!important;position:relative!important/);
  assert.match(styles, /overflow:hidden!important/);
  assert.match(styles, /\.docx-page\+\.docx-page\{break-before:page!important\}/);
  assert.doesNotMatch(styles, /page-break-after|break-inside:avoid/);
});

test('uniform pages use the default page rule without named-page transitions', () => {
  const styles = printPageStyles([{ width: 397, height: 561.5 }, { width: 397, height: 561.5 }], 0.5);
  assert.match(styles, /@page\{size:795px 1124px;margin:0\}/);
  assert.match(styles, /\.docx-print-page-1\{width:397px!important;height:561\.5px!important\}/);
  assert.match(styles, /zoom:2!important/);
});
