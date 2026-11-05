import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankDocumentBytes } from '@docx-editor.dev/core';
import { readZip, writeZip } from '@docx-editor.dev/core/store';
import { changePageNumbers, insertPageNumberField, pageNumberSettings } from '../src/word/pageNumbers.ts';

test('page number insertion at the current header/footer caret does not switch scope', async () => {
  const commands = [];
  const editor = {
    getHeaderFooterState: () => ({ editing: 'footer', sectionIndex: 1, variant: 'first' }),
    exec(command) { commands.push(command); return { ok: true }; },
  };
  await insertPageNumberField(editor, { position: 'current', align: 'left', field: 'SECTIONPAGES' });
  assert.deepEqual(commands, [{ type: 'insertPageField', field: 'SECTIONPAGES' }]);
});


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

test('page numbering supports zero starts, letter formats, continuation and chapter settings by section', () => {
  const zip = readZip(blankDocumentBytes());
  assert.equal(zip.ok, true);
  const entries = new Map(zip.entries);
  const xml = new TextDecoder().decode(entries.get('/word/document.xml'));
  const section = '<w:p><w:pPr><w:sectPr><w:pgSz w:w="11907" w:h="16840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:pPr></w:p>';
  entries.set('/word/document.xml', new TextEncoder().encode(xml.replace('<w:sectPr>', `${section}<w:sectPr>`)));
  const multiSection = writeZip(entries);
  const started = readZip(changePageNumbers(multiSection, { sectionIndex: 1, format: 'lowerLetter', start: 0, chapterStyle: 1, chapterSeparator: 'hyphen' }));
  assert.equal(started.ok, true);
  let output = new TextDecoder().decode(started.entries.get('/word/document.xml'));
  const numberType = output.match(/<w:pgNumType[^>]*\/>/)?.[0] || '';
  assert.match(numberType, /w:fmt="lowerLetter"/);
  assert.match(numberType, /w:start="0"/);
  assert.match(numberType, /w:chapStyle="1"/);
  assert.match(numberType, /w:chapSep="hyphen"/);
  const numberedBytes = writeZip(started.entries);
  assert.equal(pageNumberSettings(numberedBytes, 1).sections, 2);
  assert.equal(pageNumberSettings(numberedBytes, 1).start, 0);

  const continued = readZip(changePageNumbers(numberedBytes, { sectionIndex: 1, continue: true, clearChapter: true }));
  assert.equal(continued.ok, true);
  output = new TextDecoder().decode(continued.entries.get('/word/document.xml'));
  assert.match(output, /<w:pgNumType w:fmt="lowerLetter"\/>/);
  assert.doesNotMatch(output, /w:start="0"|w:chapStyle|w:chapSep/);
});

test('removing page numbers keeps total-page and unknown fields intact', () => {
  const zip = readZip(blankDocumentBytes());
  assert.equal(zip.ok, true);
  const entries = new Map(zip.entries);
  entries.set('/word/footer1.xml', new TextEncoder().encode('<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:fldSimple w:instr="PAGE"><w:r><w:t>2</w:t></w:r></w:fldSimple><w:fldSimple w:instr="NUMPAGES"><w:r><w:t>9</w:t></w:r></w:fldSimple><w:fldSimple w:instr="REF marker"><w:r><w:t>value</w:t></w:r></w:fldSimple></w:p></w:ftr>'));
  const output = readZip(changePageNumbers(writeZip(entries), { remove: true }));
  assert.equal(output.ok, true);
  const xml = new TextDecoder().decode(output.entries.get('/word/footer1.xml'));
  assert.doesNotMatch(xml, /instr="PAGE"/);
  assert.match(xml, /instr="NUMPAGES"/);
  assert.match(xml, /instr="REF marker"/);
});

test('Remove All clears PAGE fields in header/footer variants while preserving unrelated fields and section settings', () => {
  const zip = readZip(blankDocumentBytes());
  assert.ok(zip.ok);
  const entries = new Map(zip.entries);
  for (const [name, story] of [['/word/header1.xml', 'hdr'], ['/word/header2.xml', 'hdr'], ['/word/footer1.xml', 'ftr'], ['/word/footer2.xml', 'ftr']]) {
    entries.set(name, new TextEncoder().encode(`<w:${story} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>Keep ${name}</w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple><w:fldSimple w:instr=" REF marker "><w:r><w:t>keep field</w:t></w:r></w:fldSimple></w:p></w:${story}>`));
  }
  const originalXml = new TextDecoder().decode(entries.get('/word/document.xml'));
  entries.set('/word/document.xml', new TextEncoder().encode(originalXml.replace('<w:sectPr>', '<w:sectPr><w:pgNumType w:fmt="upperRoman" w:start="4"/>')));
  const output = readZip(changePageNumbers(writeZip(entries), { remove: true }));
  assert.ok(output.ok);
  for (const name of ['/word/header1.xml', '/word/header2.xml', '/word/footer1.xml', '/word/footer2.xml']) {
    const xml = new TextDecoder().decode(output.entries.get(name));
    assert.match(xml, new RegExp(`Keep ${name.replaceAll('/', '\\/')}`));
    assert.doesNotMatch(xml, /instr="\s*PAGE\s*"/);
    assert.match(xml, /instr=" REF marker "/);
    assert.match(xml, /w:jc w:val="center"/);
  }
  const document = new TextDecoder().decode(output.entries.get('/word/document.xml'));
  assert.match(document, /w:fmt="upperRoman" w:start="4"/);
});

test('Remove All clears alignment formatting from a page-number-only paragraph', () => {
  const zip = readZip(blankDocumentBytes());
  assert.ok(zip.ok);
  const entries = new Map(zip.entries);
  entries.set('/word/footer1.xml', new TextEncoder().encode('<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>'));
  const output = readZip(changePageNumbers(writeZip(entries), { remove: true }));
  assert.ok(output.ok);
  assert.doesNotMatch(new TextDecoder().decode(output.entries.get('/word/footer1.xml')), /w:jc/);
});

test('removing the PAGE X of Y preset removes only its paired total-page field and separator', () => {
  const zip = readZip(blankDocumentBytes());
  assert.equal(zip.ok, true);
  const entries = new Map(zip.entries);
  entries.set('/word/footer1.xml', new TextEncoder().encode('<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Page </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple><w:r><w:t xml:space="preserve"> of </w:t></w:r><w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>12</w:t></w:r></w:fldSimple><w:r><w:t> | Confidential</w:t></w:r></w:p></w:ftr>'));
  const output = readZip(changePageNumbers(writeZip(entries), { remove: true }));
  assert.equal(output.ok, true);
  const xml = new TextDecoder().decode(output.entries.get('/word/footer1.xml'));
  assert.match(xml, /Page /);
  assert.match(xml, /Confidential/);
  assert.doesNotMatch(xml, /instr="PAGE|instr="NUMPAGES|> of </);
});

test('unknown page-number formats survive reading and editing other settings', () => {
  const zip = readZip(changePageNumbers(blankDocumentBytes(), { sectionIndex: 0, format: 'preservedWordFormat', start: 5 }));
  assert.equal(zip.ok, true);
  const bytes = writeZip(zip.entries);
  assert.equal(pageNumberSettings(bytes).format, 'preservedWordFormat');
  const updated = readZip(changePageNumbers(bytes, { sectionIndex: 0, continue: true }));
  assert.equal(updated.ok, true);
  const xml = new TextDecoder().decode(updated.entries.get('/word/document.xml'));
  assert.match(xml, /w:fmt="preservedWordFormat"/);
  assert.doesNotMatch(xml, /w:start="5"/);
});
