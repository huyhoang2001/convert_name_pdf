import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readZip, writeZip } from '@docx-editor.dev/core/store';
import { blankWordDocument, checkDocxOpen, checkDocxOutput, checkDocxRoundTrip, checkDocxSave, decodeDocx, encodeDocx, preserveDocxSectionProperties } from '../src/word/docx.ts';
import { changePageNumbers } from '../src/word/pageNumbers.ts';

test('blank Word documents are valid A4 DOCX and survive serialization', async () => {
  const bytes = blankWordDocument();
  const decoded = decodeDocx(encodeDocx(bytes));
  assert.equal(checkDocxRoundTrip(bytes, decoded), null);
  const result = (await import('@docx-editor.dev/core/store')).readOoxmlPackage(decoded);
  assert.ok(result.ok);
  const xml = new TextDecoder().decode(result.package.partBytes.get('/word/document.xml'));
  assert.match(xml, /w:w="11907"\s+w:h="16840"/);
});

test('header and footer fields survive independent DOCX save and reopen', () => {
  const zip = readZip(blankWordDocument());
  assert.ok(zip.ok);
  const entries = new Map(zip.entries);
  const document = new TextDecoder().decode(entries.get('/word/document.xml'))
    .replace('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"', 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"')
    .replace('<w:sectPr>', '<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/>');
  entries.set('/word/document.xml', new TextEncoder().encode(document));
  entries.set('/word/header1.xml', new TextEncoder().encode('<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>H </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple><w:fldSimple w:instr=" REF marker "><w:r><w:t>keep</w:t></w:r></w:fldSimple></w:p></w:hdr>'));
  entries.set('/word/footer1.xml', new TextEncoder().encode('<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple><w:r><w:t xml:space="preserve"> of </w:t></w:r><w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>4</w:t></w:r></w:fldSimple></w:p></w:ftr>'));
  entries.set('/word/_rels/document.xml.rels', new TextEncoder().encode('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>'));
  entries.set('/[Content_Types].xml', new TextEncoder().encode('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>'));
  const original = writeZip(entries);
  const edited = changePageNumbers(original, { sectionIndex: 0, format: 'upperRoman', start: 1 });
  assert.equal(checkDocxSave(original, edited), null);
  const reopened = readZip(decodeDocx(encodeDocx(edited)));
  assert.ok(reopened.ok);
  const header = new TextDecoder().decode(reopened.entries.get('/word/header1.xml'));
  const footer = new TextDecoder().decode(reopened.entries.get('/word/footer1.xml'));
  assert.match(header, /instr=" PAGE "/);
  assert.match(header, /instr=" REF marker "/);
  assert.match(footer, /instr=" PAGE "/);
  assert.match(footer, /instr=" NUMPAGES "/);
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

test('section preservation keeps unknown metadata without reverting page numbering or header variants', () => {
  const sourceZip = readZip(blankWordDocument());
  assert.ok(sourceZip.ok);
  const sourceEntries = new Map(sourceZip.entries);
  const sourceXml = new TextDecoder().decode(sourceEntries.get('/word/document.xml'));
  sourceEntries.set('/word/document.xml', new TextEncoder().encode(sourceXml.replace('<w:sectPr>', '<w:sectPr><w:pgNumType w:fmt="decimal" w:start="1"/><w:titlePg/><w:docGrid w:linePitch="360"/>')));
  const source = writeZip(sourceEntries);

  const savedEntries = new Map(sourceEntries);
  const savedXml = new TextDecoder().decode(savedEntries.get('/word/document.xml'));
  savedEntries.set('/word/document.xml', new TextEncoder().encode(savedXml.replace('<w:pgNumType w:fmt="decimal" w:start="1"/><w:titlePg/><w:docGrid w:linePitch="360"/>', '<w:pgNumType w:fmt="upperRoman" w:start="4"/>')));
  const saved = writeZip(savedEntries);
  assert.equal(checkDocxSave(source, saved), null);
  const preservedZip = readZip(preserveDocxSectionProperties(source, saved));
  assert.ok(preservedZip.ok);
  const result = new TextDecoder().decode(preservedZip.entries.get('/word/document.xml'));
  assert.match(result, /w:fmt="upperRoman" w:start="4"/);
  assert.match(result, /w:docGrid w:linePitch="360"/);
  assert.doesNotMatch(result, /<w:titlePg/);
});

test('save guard accepts section breaks that keep an existing page setup', () => {
  const original = blankWordDocument();
  const originalZip = readZip(original);
  assert.ok(originalZip.ok);
  const entries = new Map(originalZip.entries);
  const xml = new TextDecoder().decode(entries.get('/word/document.xml'));
  const section = '<w:p><w:pPr><w:sectPr><w:pgSz w:w="11907" w:h="16840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:pPr></w:p>';
  entries.set('/word/document.xml', new TextEncoder().encode(xml.replace('<w:sectPr>', `${section}<w:sectPr>`)));
  const sectioned = writeZip(entries);
  assert.equal(checkDocxSave(original, sectioned), null);
  assert.ok(readZip(preserveDocxSectionProperties(original, sectioned)).ok);
});

test('save guard permits omission of an unreferenced numbering part', () => {
  const zip = readZip(blankWordDocument());
  assert.ok(zip.ok);
  const sourceEntries = new Map(zip.entries);
  const relsName = '/word/_rels/document.xml.rels';
  const rels = new TextDecoder().decode(sourceEntries.get(relsName));
  sourceEntries.set(relsName, new TextEncoder().encode(rels.replace('</Relationships>', '<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>')));
  sourceEntries.set('/word/numbering.xml', new TextEncoder().encode('<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"/><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>'));
  const typesName = '/[Content_Types].xml';
  sourceEntries.set(typesName, new TextEncoder().encode(new TextDecoder().decode(sourceEntries.get(typesName)).replace('</Types>', '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>')));
  const original = writeZip(sourceEntries);
  const outputEntries = new Map(sourceEntries);
  outputEntries.delete('/word/numbering.xml');
  outputEntries.set(relsName, new TextEncoder().encode(rels));
  outputEntries.set(typesName, new TextEncoder().encode(new TextDecoder().decode(outputEntries.get(typesName)).replace(/<Override PartName="\/word\/numbering\.xml"[^>]*\/>/, '')));
  assert.equal(checkDocxSave(original, writeZip(outputEntries)), null);
});

test('Wordcraft open guard rejects dropping numbering used by list paragraphs', () => {
  const sourceEntries = new Map(readZip(blankWordDocument()).entries);
  const documentName = '/word/document.xml';
  const document = new TextDecoder().decode(sourceEntries.get(documentName)).replace('<w:body>', '<w:body><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>List</w:t></w:r></w:p>');
  sourceEntries.set(documentName, new TextEncoder().encode(document));
  const relsName = '/word/_rels/document.xml.rels';
  const rels = new TextDecoder().decode(sourceEntries.get(relsName));
  sourceEntries.set(relsName, new TextEncoder().encode(rels.replace('</Relationships>', '<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>')));
  sourceEntries.set('/word/numbering.xml', new TextEncoder().encode('<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>'));
  const typesName = '/[Content_Types].xml';
  sourceEntries.set(typesName, new TextEncoder().encode(new TextDecoder().decode(sourceEntries.get(typesName)).replace('</Types>', '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>')));
  const original = writeZip(sourceEntries);
  const outputEntries = new Map(sourceEntries);
  outputEntries.delete('/word/numbering.xml');
  outputEntries.set(relsName, new TextEncoder().encode(rels));
  outputEntries.set(typesName, new TextEncoder().encode(new TextDecoder().decode(outputEntries.get(typesName)).replace(/<Override PartName="\/word\/numbering\.xml"[^>]*\/>/, '')));
  assert.match(checkDocxOpen(original, writeZip(outputEntries)), /numbering that Wordcraft could not preserve safely/);
  const changedNumbering = new Map(sourceEntries);
  changedNumbering.set('/word/numbering.xml', new TextEncoder().encode(new TextDecoder().decode(changedNumbering.get('/word/numbering.xml')).replace('w:val="decimal"', 'w:val="lowerLetter"')));
  assert.equal(checkDocxSave(original, writeZip(changedNumbering)), null);
  assert.match(checkDocxOpen(original, writeZip(changedNumbering)), /numbering that Wordcraft could not preserve safely/);
});

test('save guard reports the exact broken relationship', () => {
  const original = blankWordDocument();
  const zip = readZip(original);
  assert.ok(zip.ok);
  const entries = new Map(zip.entries);
  const name = '/word/_rels/document.xml.rels';
  entries.set(name, new TextEncoder().encode(new TextDecoder().decode(entries.get(name)).replace('</Relationships>', '<Relationship Id="rIdBroken" Type="urn:unknown" Target="missing.xml"/></Relationships>')));
  const error = checkDocxSave(original, writeZip(entries));
  assert.match(error, /source part \/word\/document\.xml/);
  assert.match(error, /relationship part \/word\/_rels\/document\.xml\.rels/);
  assert.match(error, /relationship ID "rIdBroken"/);
  assert.match(error, /type "urn:unknown"/);
  assert.match(error, /target "missing\.xml"/);
  assert.match(error, /resolves to missing package part \/word\/missing\.xml/);
});

test('relationship validation resolves escaped, relative, and package-absolute targets', () => {
  const zip = readZip(blankWordDocument());
  assert.ok(zip.ok);
  const entries = new Map(zip.entries);
  const relsName = '/word/_rels/document.xml.rels';
  const rels = new TextDecoder().decode(entries.get(relsName));
  entries.set(relsName, new TextEncoder().encode(rels
    .replace('Target="styles.xml"', 'Target="%73tyles.xml"')
    .replace('</Relationships>', '<Relationship Id="rIdRelative" Type="urn:relative" Target="../word/styles.xml"/><Relationship Id="rIdAbsolute" Type="urn:absolute" Target="/word/styles.xml"/><Relationship Id="rIdExternal" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/path" TargetMode="External"/></Relationships>')));
  assert.equal(checkDocxSave(blankWordDocument(), writeZip(entries)), null);
});

test('relationship validation rejects duplicate IDs within one relationship part', () => {
  const original = blankWordDocument();
  const zip = readZip(original);
  assert.ok(zip.ok);
  const entries = new Map(zip.entries);
  const name = '/word/_rels/document.xml.rels';
  entries.set(name, new TextEncoder().encode(new TextDecoder().decode(entries.get(name)).replace('</Relationships>', '<Relationship Id="rId1" Type="urn:other" Target="styles.xml"/></Relationships>')));
  assert.match(checkDocxSave(original, writeZip(entries)) ?? '', /relationship ID "rId1".*duplicated within this relationship part/);
});

test('relationship validation reports malformed internal target resolution', () => {
  const original = blankWordDocument();
  const zip = readZip(original);
  assert.ok(zip.ok);
  const entries = new Map(zip.entries);
  const name = '/word/_rels/document.xml.rels';
  entries.set(name, new TextEncoder().encode(new TextDecoder().decode(entries.get(name)).replace('</Relationships>', '<Relationship Id="rIdEscape" Type="urn:escape" Target="../../../../outside.xml"/></Relationships>')));
  const error = checkDocxSave(original, writeZip(entries));
  assert.match(error ?? '', /source part \/word\/document\.xml/);
  assert.match(error ?? '', /relationship ID "rIdEscape"/);
  assert.match(error ?? '', /type "urn:escape"/);
  assert.match(error ?? '', /target "\.\.\/\.\.\/\.\.\/\.\.\/outside\.xml"/);
  assert.match(error ?? '', /traversal-escape/);
});

test('relationship validation rejects markup references with no matching relationship', () => {
  const original = blankWordDocument();
  const zip = readZip(original);
  assert.ok(zip.ok);
  const entries = new Map(zip.entries);
  const name = '/word/document.xml';
  const xml = new TextDecoder().decode(entries.get(name)).replace('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"', 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdMissing"');
  entries.set(name, new TextEncoder().encode(xml));
  const error = checkDocxSave(original, writeZip(entries));
  assert.match(error ?? '', /source part \/word\/document\.xml/);
  assert.match(error ?? '', /relationship ID "rIdMissing"/);
  assert.match(error ?? '', /markup references a relationship ID that does not exist/);
});

test('relationship validation rejects a section reference mapped to the wrong relationship type', () => {
  const original = blankWordDocument();
  const zip = readZip(original);
  assert.ok(zip.ok);
  const entries = new Map(zip.entries);
  const name = '/word/document.xml';
  const xml = new TextDecoder().decode(entries.get(name))
    .replace('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"', 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"')
    .replace('<w:sectPr>', '<w:sectPr><w:headerReference w:type="default" r:id="rId1"/>');
  entries.set(name, new TextEncoder().encode(xml));
  assert.match(checkDocxOutput(writeZip(entries)) ?? '', /relationship ID "rId1".*headerReference requires a header relationship/);
});

test('relationship validation rejects malformed external targets without fetching them', () => {
  const original = blankWordDocument();
  const zip = readZip(original);
  assert.ok(zip.ok);
  const entries = new Map(zip.entries);
  const name = '/word/_rels/document.xml.rels';
  entries.set(name, new TextEncoder().encode(new TextDecoder().decode(entries.get(name)).replace('</Relationships>', '<Relationship Id="rIdExternal" Type="urn:external" Target="relative/path" TargetMode="External"/></Relationships>')));
  assert.match(checkDocxSave(original, writeZip(entries)) ?? '', /relationship ID "rIdExternal".*invalid external URI/);
});

test('section preservation restores required relationships and remaps colliding IDs', () => {
  const blank = readZip(blankWordDocument());
  assert.ok(blank.ok);
  const sourceEntries = new Map(blank.entries);
  const documentName = '/word/document.xml', relsName = '/word/_rels/document.xml.rels', typesName = '/[Content_Types].xml';
  const originalXml = new TextDecoder().decode(sourceEntries.get(documentName));
  const originalRels = new TextDecoder().decode(sourceEntries.get(relsName));
  sourceEntries.set(documentName, new TextEncoder().encode(originalXml
    .replace('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"', 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"')
    .replace('<w:sectPr>', '<w:sectPr><w:printerSettings r:id="rIdPrinter"/>')));
  sourceEntries.set(relsName, new TextEncoder().encode(originalRels.replace('</Relationships>', '<Relationship Id="rIdPrinter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/printerSettings" Target="printerSettings/printerSettings1.bin"/></Relationships>')));
  sourceEntries.set('/word/printerSettings/printerSettings1.bin', Uint8Array.of(1, 2, 3));
  sourceEntries.set(typesName, new TextEncoder().encode(new TextDecoder().decode(sourceEntries.get(typesName)).replace('</Types>', '<Override PartName="/word/printerSettings/printerSettings1.bin" ContentType="application/octet-stream"/></Types>')));
  const source = writeZip(sourceEntries);
  assert.equal(checkDocxOutput(source), null);
  for (const conflict of [false, true]) {
    const outputEntries = new Map(sourceEntries);
    outputEntries.set(documentName, new TextEncoder().encode(new TextDecoder().decode(outputEntries.get(documentName)).replace('<w:printerSettings r:id="rIdPrinter"/>', '')));
    outputEntries.set(relsName, new TextEncoder().encode(conflict ? originalRels.replace('</Relationships>', '<Relationship Id="rIdPrinter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>') : originalRels));
    const output = writeZip(outputEntries);
    assert.equal(checkDocxSave(source, output), null);
    const restored = preserveDocxSectionProperties(source, output);
    assert.equal(checkDocxOutput(restored), null);
    assert.equal(checkDocxSave(source, restored), null);
    const zip = readZip(restored);
    assert.ok(zip.ok);
    const xml = new TextDecoder().decode(zip.entries.get(documentName));
    const rels = new TextDecoder().decode(zip.entries.get(relsName));
    const id = xml.match(/<w:printerSettings[^>]*r:id="([^"]+)"/)?.[1];
    assert.ok(id);
    if (conflict) assert.notEqual(id, 'rIdPrinter');
    assert.match(rels, new RegExp(`Id="${id}"[^>]*Target="/word/printerSettings/printerSettings1.bin"`));
  }
});
