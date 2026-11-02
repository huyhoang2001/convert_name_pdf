import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readZip, writeZip } from '@docx-editor.dev/core/store';
import { blankWordDocument, checkDocxRoundTrip, checkDocxSave, decodeDocx, encodeDocx, preserveDocxSectionProperties } from '../src/word/docx.ts';

test('blank Word documents are valid A4 DOCX and survive serialization', async () => {
  const bytes = blankWordDocument();
  const decoded = decodeDocx(encodeDocx(bytes));
  assert.equal(checkDocxRoundTrip(bytes, decoded), null);
  const result = (await import('@docx-editor.dev/core/store')).readOoxmlPackage(decoded);
  assert.ok(result.ok);
  const xml = new TextDecoder().decode(result.package.partBytes.get('/word/document.xml'));
  assert.match(xml, /w:w="11907"\s+w:h="16840"/);
});

test('DOCX guards reject changed source structure and changed page setup', async () => {
  const original = blankWordDocument();
  const zip = readZip(original);
  assert.ok(zip.ok);
  const changed = new Map(zip.entries);
  changed.set('/word/document.xml', new TextEncoder().encode(new TextDecoder().decode(changed.get('/word/document.xml')).replace('w:w="11907"', 'w:w="11908"')));
  const altered = writeZip(changed);
  assert.match(checkDocxRoundTrip(original, altered), /changed/);
  assert.match(checkDocxSave(original, altered), /page setup or section layout/);
});

test('round-trip guard accepts a reordered markup-compatibility Ignorable list', () => {
  const original = blankWordDocument();
  const zip = readZip(original);
  assert.ok(zip.ok);
  const entries = new Map(zip.entries);
  const xml = new TextDecoder().decode(entries.get('/word/document.xml'));
  const oldList = 'w14 w15 w16se w16cid w16 w16cex w16sdtdh wp14';
  const newList = 'w14 w15 w16 w16cex w16cid w16sdtdh w16se wp14';
  const declarations = ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:w14="urn:w14" xmlns:w15="urn:w15" xmlns:w16se="urn:w16se" xmlns:w16cid="urn:w16cid" xmlns:w16="urn:w16" xmlns:w16cex="urn:w16cex" xmlns:w16sdtdh="urn:w16sdtdh" xmlns:wp14="urn:wp14"';
  const changed = xml.replace('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"', `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"${declarations} mc:Ignorable="${newList}"`).replace('<w:sectPr>', `<w:sectPr mc:Ignorable="${newList}">`);
  const savedEntries = new Map(entries);
  savedEntries.set('/word/document.xml', new TextEncoder().encode(changed.replaceAll(newList, oldList)));
  const saved = writeZip(savedEntries);
  const originalWithList = writeZip(new Map([...entries, ['/word/document.xml', new TextEncoder().encode(changed)]]));
  assert.equal(checkDocxRoundTrip(originalWithList, saved), null);
  assert.equal(checkDocxSave(originalWithList, saved), null);
});

test('save guard compares resolved page setup instead of sectPr serialization details', () => {
  const original = blankWordDocument();
  const zip = readZip(original);
  assert.ok(zip.ok);
  const entries = new Map(zip.entries);
  const xml = new TextDecoder().decode(entries.get('/word/document.xml'));
  const equivalent = xml.replace('w:w="11907" w:h="16840"', 'w:h="16840" w:w="11907" w:orient="portrait"').replace('w:header="720" w:footer="720" w:gutter="0"', 'w:gutter="0" w:footer="720" w:header="720"');
  entries.set('/word/document.xml', new TextEncoder().encode(equivalent));
  const saved = writeZip(entries);
  assert.equal(checkDocxSave(original, saved), null);
  const preserved = preserveDocxSectionProperties(original, saved);
  const preservedZip = readZip(preserved);
  assert.ok(preservedZip.ok);
  const preservedXml = new TextDecoder().decode(preservedZip.entries.get('/word/document.xml'));
  assert.match(preservedXml, /w:w="11907"/);
  assert.match(preservedXml, /w:h="16840"/);
  assert.doesNotMatch(preservedXml, /orient=/);
});

test('save guard rejects changed page size or margins and preserves every paragraph and body section node', () => {
  const originalZip = readZip(blankWordDocument());
  assert.ok(originalZip.ok);
  const entries = new Map(originalZip.entries);
  const originalXml = new TextDecoder().decode(entries.get('/word/document.xml'));
  const paragraphSection = '<w:p><w:pPr><w:sectPr><w:pgSz w:w="11907" w:h="16840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:pPr></w:p>';
  const multiSectionXml = originalXml.replace('<w:sectPr>', `${paragraphSection}<w:sectPr>`);
  entries.set('/word/document.xml', new TextEncoder().encode(multiSectionXml));
  const original = writeZip(entries);
  const changedEntries = new Map(entries);
  changedEntries.set('/word/document.xml', new TextEncoder().encode(multiSectionXml.replace('w:left="1440"', 'w:left="1441"')));
  assert.match(checkDocxSave(original, writeZip(changedEntries)), /page setup or section layout/);
  const orientationEntries = new Map(entries);
  orientationEntries.set('/word/document.xml', new TextEncoder().encode(multiSectionXml.replace('<w:pgSz', '<w:pgSz w:orient="landscape"')));
  assert.match(checkDocxSave(original, writeZip(orientationEntries)), /page setup or section layout/);

  const equivalentEntries = new Map(entries);
  equivalentEntries.set('/word/document.xml', new TextEncoder().encode(multiSectionXml.replaceAll('<w:pgSz', '<w:pgSz w:code="9"')));
  const equivalentSaved = writeZip(equivalentEntries);
  assert.equal(checkDocxSave(original, equivalentSaved), null);
  const preservedZip = readZip(preserveDocxSectionProperties(original, equivalentSaved));
  assert.ok(preservedZip.ok);
  const preservedXml = new TextDecoder().decode(preservedZip.entries.get('/word/document.xml'));
  assert.equal((preservedXml.match(/<w:sectPr/g) || []).length, 2);
  assert.doesNotMatch(preservedXml, /w:code="9"/);
  assert.match(preservedXml, /<w:pPr><w:sectPr>/);
});
