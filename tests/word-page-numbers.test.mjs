import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankDocumentBytes } from '@docx-editor.dev/core';
import { readZip, writeZip } from '@docx-editor.dev/core/store';
import { changePageNumbers } from '../src/word/pageNumbers.ts';

test('number formatting changes only the selected section settings', () => {
  const result = changePageNumbers(blankDocumentBytes(), { sectionIndex: 0, format: 'upperRoman', start: 3 });
  const zip = readZip(result);
  assert.equal(zip.ok, true);
  const xml = new TextDecoder().decode(zip.entries.get('/word/document.xml'));
  assert.match(xml, /<w:pgNumType w:fmt="upperRoman" w:start="3"\/>/);
  assert.match(xml, /<w:pgMar\b/);
});

test('removing page numbers preserves adjacent header text', () => {
  const zip = readZip(blankDocumentBytes());
  assert.equal(zip.ok, true);
  const entries = new Map(zip.entries);
  entries.set('/word/header1.xml', new TextEncoder().encode('<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Report | </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:hdr>'));
  const result = changePageNumbers(writeZip(entries), { remove: true });
  const output = readZip(result);
  assert.equal(output.ok, true);
  const xml = new TextDecoder().decode(output.entries.get('/word/header1.xml'));
  assert.match(xml, /Report \| /);
  assert.doesNotMatch(xml, /fldSimple|PAGE/);
});

test('removing a complex PAGE field keeps neighbouring runs', () => {
  const zip = readZip(blankDocumentBytes());
  assert.equal(zip.ok, true);
  const entries = new Map(zip.entries);
  entries.set('/word/footer1.xml', new TextEncoder().encode('<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Page </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:t> | Confidential</w:t></w:r></w:p></w:ftr>'));
  const output = readZip(changePageNumbers(writeZip(entries), { remove: true }));
  assert.equal(output.ok, true);
  const xml = new TextDecoder().decode(output.entries.get('/word/footer1.xml'));
  assert.match(xml, /Page /);
  assert.match(xml, /Confidential/);
  assert.doesNotMatch(xml, /fldChar|instrText/);
});
