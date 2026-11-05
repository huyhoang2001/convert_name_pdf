import { blankDocumentBytes } from '@docx-editor.dev/core';
import { partNameKey, readOoxmlPackage, readXml, readZip, resolveInternalTarget, validateExternalTarget, writeZip } from '@docx-editor.dev/core/store';
import { createFontSource, type FontConfigurationFragment } from '@docx-editor.dev/core/editor';
import type { FontSourceSubstitution } from '@docx-editor.dev/core/contracts/editor';
import { serializeOoxmlPart } from '@docx-editor.dev/core/store';
import type { WordFont } from './bridge';

export function decodeDocx(encoded: string): Uint8Array {
  const binary = atob(encoded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function encodeDocx(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(binary);
}

export function blankWordDocument(): Uint8Array {
  const zip = readZip(blankDocumentBytes());
  if (!zip.ok) throw Error('Could not create a blank DOCX.');
  const document = zip.entries.get('/word/document.xml');
  if (!document) throw Error('The blank DOCX is missing its main document.');
  const entries = new Map(zip.entries);
  entries.set('/word/document.xml', new TextEncoder().encode(new TextDecoder().decode(document).replace('w:w="12240" w:h="15840"', 'w:w="11907" w:h="16840"')));
  const packageBytes = writeZip(entries);
  if (!readOoxmlPackage(packageBytes).ok) throw Error('The blank DOCX package is invalid.');
  return packageBytes;
}

export function fontConfiguration(fonts: WordFont[]): FontConfigurationFragment {
  const sources = fonts.flatMap(face => {
    const result = createFontSource(decodeDocx(face.bytesBase64), { family: face.family, weight: face.weight, style: face.style });
    return 'source' in result ? [result.source] : [];
  });
  return { sources, supportedFamilies: [...new Set(fonts.map(face => face.family))] };
}

export function substituteMissingFonts(configuration: FontConfigurationFragment, missing: readonly string[]): FontConfigurationFragment | null {
  const sources = configuration.sources ?? [];
  const substitutions: FontSourceSubstitution[] = [];
  for (const family of missing) {
    const lower = family.toLowerCase();
    const target = lower === 'open sans' || lower === 'sf pro text' ? 'Arial' : lower === 'times new roman bold' || lower === '.vntime' ? 'Times New Roman' : '';
    if (!target) return null;
    const matches = sources.map(source => source.request).filter(request => request.family.toLowerCase() === target.toLowerCase() && (lower !== 'times new roman bold' || request.weight === 700));
    if (!matches.length) return null;
    substitutions.push(...matches.map(to => ({ from: { ...to, family }, to } satisfies FontSourceSubstitution)));
  }
  return { ...configuration, substitutions: [...(configuration.substitutions ?? []), ...substitutions] };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    if (key === 'id' || key === 'prefix' || key === 'namespaceBindings') continue;
    if (key === 'attributes' && Array.isArray(record[key])) {
      output[key] = record[key].filter(attribute => !['xmlSpace'].includes((attribute as { kind?: string }).kind || '') && !['paraId', 'textId'].includes((attribute as { localName?: string }).localName || '')).map(attribute => {
        const normalized = canonical(attribute) as Record<string, unknown>;
        if (normalized.namespaceUri === 'http://schemas.openxmlformats.org/markup-compatibility/2006' && normalized.localName === 'Ignorable') normalized.value = String(normalized.value).split(/\s+/).filter(Boolean).sort().join(' ');
        return normalized;
      }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    } else output[key] = canonical(record[key]);
  }
  return output;
}

function firstDifference(left: unknown, right: unknown, path = ''): string | null {
  if (Object.is(left, right)) return null;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return `${path || '/'}: ${JSON.stringify(left)?.slice(0, 80)} => ${JSON.stringify(right)?.slice(0, 80)}`;
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const found = firstDifference(a[key], b[key], `${path}/${key}`);
    if (found) return found;
  }
  return null;
}

export function checkDocxRoundTrip(original: Uint8Array, saved: Uint8Array): string | null {
  const before = readOoxmlPackage(original), after = readOoxmlPackage(saved);
  if (!before.ok || !after.ok) return 'The DOCX package could not be checked safely.';
  const source = before.package, output = after.package;
  if (source.partBytes.size !== output.partBytes.size) return 'The editor changed the document package structure.';
  for (const [name, bytes] of source.partBytes) {
    const next = output.partBytes.get(name);
    if (!next) return `The editor removed ${name}.`;
    const tree = source.parts.get(name);
    if (tree) {
      const difference = firstDifference(canonical(tree), canonical(output.parts.get(name)));
      if (difference) return `The editor changed ${name} before editing (${difference}).`;
    } else if (bytes.length !== next.length || bytes.some((byte, index) => byte !== next[index])) return `The editor changed ${name} before editing.`;
  }
  return null;
}

type XmlNode = { localName?: string; namespaceUri?: string; children?: readonly XmlNode[]; [key: string]: unknown };
type OoxmlPackage = Extract<ReturnType<typeof readOoxmlPackage>, { ok: true }>['package'];
const wordNamespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const relationshipsNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function sectionNodes(root: XmlNode): XmlNode[] {
  const found: XmlNode[] = [];
  const visit = (node: XmlNode, parent?: XmlNode) => {
    if (node.namespaceUri === wordNamespace && node.localName === 'sectPr' && (parent?.localName === 'pPr' || parent?.localName === 'body')) found.push(node);
    node.children?.forEach(child => visit(child, node));
  };
  visit(root);
  return found;
}

function sectionSettings(nodes: XmlNode[]) {
  const child = (node: XmlNode, name: string) => node.children?.find(value => value.namespaceUri === wordNamespace && value.localName === name);
  const value = (node: XmlNode | undefined, name: string, fallback: number | string) => {
    const raw = node?.attributes && (node.attributes as { namespaceUri?: string; localName?: string; value?: string }[]).find(attribute => attribute.namespaceUri === wordNamespace && attribute.localName === name)?.value;
    if (raw === undefined) return fallback;
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : raw;
  };
  return nodes.map(section => {
    const size = child(section, 'pgSz'), margins = child(section, 'pgMar');
    return {
      pageW: value(size, 'w', 12240), pageH: value(size, 'h', 15840), orient: value(size, 'orient', 'portrait'),
      top: value(margins, 'top', 1440), right: value(margins, 'right', 1440), bottom: value(margins, 'bottom', 1440), left: value(margins, 'left', 1440),
      header: value(margins, 'header', 720), footer: value(margins, 'footer', 720), gutter: value(margins, 'gutter', 0),
    };
  });
}

function sectionSettingsArePreserved(original: ReturnType<typeof sectionSettings>, saved: ReturnType<typeof sectionSettings>): boolean {
  if (saved.length === original.length) return original.every((section, index) => JSON.stringify(section) === JSON.stringify(saved[index]));
  return saved.length > 0 && saved.every(section => original.some(source => JSON.stringify(section) === JSON.stringify(source)));
}

function attr(node: XmlNode | undefined, localName: string): string | undefined {
  return (node?.attributes as { namespaceUri?: string; localName?: string; value?: string }[] | undefined)?.find(value => value.namespaceUri === wordNamespace && value.localName === localName)?.value;
}

function descendants(root: XmlNode, localName: string): XmlNode[] {
  const found: XmlNode[] = [];
  const visit = (node: XmlNode) => {
    if (node.namespaceUri === wordNamespace && node.localName === localName) found.push(node);
    node.children?.forEach(visit);
  };
  visit(root);
  return found;
}

function numberReferences(root: XmlNode | undefined): Set<string> {
  const result = new Set<string>();
  if (!root) return result;
  for (const props of descendants(root, 'numPr')) {
    const id = props.children?.find(node => node.namespaceUri === wordNamespace && node.localName === 'numId');
    const value = attr(id, 'val');
    if (value && value !== '0') result.add(value);
  }
  return result;
}

function numberingIsPreserved(source: OoxmlPackage, output: OoxmlPackage, requireReferences = false): boolean {
  const sourceMain = source.parts.get(source.mainDocumentPart)?.root as XmlNode | undefined;
  const outputMain = output.parts.get(output.mainDocumentPart)?.root as XmlNode | undefined;
  const sourceStyles = source.parts.get('/word/styles.xml')?.root as XmlNode | undefined;
  const outputStyles = output.parts.get('/word/styles.xml')?.root as XmlNode | undefined;
  const sourceRefs = new Set([...numberReferences(sourceMain), ...numberReferences(sourceStyles)]);
  const outputRefs = new Set([...numberReferences(outputMain), ...numberReferences(outputStyles)]);
  const definitions = (root: XmlNode) => new Map(descendants(root, 'num').flatMap(num => {
    const id = (num.attributes as { localName?: string; value?: string }[] | undefined)?.find(value => value.localName === 'numId')?.value;
    const abstract = num.children?.find(node => node.namespaceUri === wordNamespace && node.localName === 'abstractNumId');
    const abstractId = attr(abstract, 'val');
    if (!id || !abstractId) return [];
    const levels = descendants(root, 'abstractNum').find(node => (node.attributes as { localName?: string; value?: string }[] | undefined)?.find(value => value.localName === 'abstractNumId')?.value === abstractId);
    if (!levels) return [];
    const levelSignature = (level: XmlNode) => ['start','numFmt','lvlText','suff','lvlJc'].map(name => {
      const field = level.children?.find(node => node.namespaceUri === wordNamespace && node.localName === name);
      const defaults: Record<string, string> = { start: '1', numFmt: 'decimal', lvlText: '', suff: 'tab', lvlJc: 'left' };
      return `${name}=${attr(field, 'val') ?? defaults[name]}`;
    }).join(';');
    const base = descendants(levels, 'lvl').map(level => `${(level.attributes as { localName?: string; value?: string }[] | undefined)?.find(value => value.localName === 'ilvl')?.value ?? '0'}:${levelSignature(level)}`).join('|');
    const overrides = descendants(num, 'lvlOverride').map(override => {
      const level = override.children?.find(node => node.namespaceUri === wordNamespace && node.localName === 'lvl');
      const start = override.children?.find(node => node.namespaceUri === wordNamespace && node.localName === 'startOverride');
      const index = (override.attributes as { localName?: string; value?: string }[] | undefined)?.find(value => value.localName === 'ilvl')?.value ?? '0';
      return `${index}:start=${attr(start, 'val') ?? ''}:${level ? levelSignature(level) : ''}`;
    }).join('|');
    const signature = `${base}#${overrides}`;
    return [[id, signature] as const];
  }));
  const originalNumbering = [...source.parts].find(([name]) => name.toLowerCase() === '/word/numbering.xml')?.[1]?.root as XmlNode | undefined;
  const outputNumbering = [...output.parts].find(([name]) => name.toLowerCase() === '/word/numbering.xml')?.[1]?.root as XmlNode | undefined;
  if (outputRefs.size && !outputNumbering) return false;
  if (sourceRefs.size && !originalNumbering) return false;
  const before = originalNumbering ? definitions(originalNumbering) : new Map<string, string>();
  const after = outputNumbering ? definitions(outputNumbering) : new Map<string, string>();
  if ([...outputRefs].some(id => !after.has(id))) return false;
  if (!sourceRefs.size) return true;
  if (!outputRefs.size) return !requireReferences;
  if (!requireReferences) return true;
  for (const id of sourceRefs) {
    const sourceSignature = before.get(id), outputSignature = after.get(id);
    if (!sourceSignature || !outputSignature) return false;
    const [sourceLevels, sourceOverrides] = sourceSignature.split('#'), [outputLevels, outputOverrides] = outputSignature.split('#');
    const expectedLevels = sourceLevels ? sourceLevels.split('|') : [], actualLevels = outputLevels ? outputLevels.split('|') : [];
    if (sourceOverrides !== outputOverrides || expectedLevels.some((level, index) => actualLevels[index] !== level)) return false;
  }
  return true;
}

function relationshipPartName(owner: string): string {
  const slash = owner.lastIndexOf('/');
  return owner === '/' ? '/_rels/.rels' : `${owner.slice(0, slash)}/_rels/${owner.slice(slash + 1)}.rels`;
}

function partName(pkg: OoxmlPackage, candidate: string): string | undefined {
  const key = partNameKey(candidate);
  return [...pkg.partBytes.keys()].find(name => partNameKey(name) === key);
}

function relationshipError(owner: string, id: string, type: string, target: string, reason: string): string {
  return `DOCX relationship validation failed: source part ${owner}; relationship part ${relationshipPartName(owner)}; relationship ID "${id || '(missing)'}"; type "${type || '(missing)'}"; target "${target || '(missing)'}"; reason: ${reason}.`;
}

function relationshipsAreValid(pkg: OoxmlPackage): string | null {
  for (const [part, contentType] of pkg.contentTypes.overrides) {
    if (!partName(pkg, part) || !contentType) return `DOCX content type validation failed: part ${part} has no matching package part or content type.`;
  }
  for (const [owner, relationships] of pkg.relationships) {
    const ids = new Set<string>();
    for (const relationship of relationships) {
      const id = relationship.id ?? '', type = relationship.type ?? '', rawTarget = relationship.rawTarget ?? '';
      if (!id || ids.has(id)) return relationshipError(owner, id, type, rawTarget, !id ? 'relationship ID is empty' : 'relationship ID is duplicated within this relationship part');
      ids.add(id);
      if (!type || !rawTarget) return relationshipError(owner, id, type, rawTarget, !type ? 'relationship type is empty' : 'relationship target is empty');
      if (relationship.targetMode === 'External') {
        const result = validateExternalTarget(rawTarget);
        if (!result.ok) return relationshipError(owner, id, type, rawTarget, `invalid external URI (${result.reason})`);
        continue;
      }
      if (relationship.targetMode !== 'Internal') return relationshipError(owner, id, type, rawTarget, `unsupported target mode "${relationship.targetMode}"`);
      const resolved = resolveInternalTarget(owner, rawTarget);
      if (!resolved.ok) return relationshipError(owner, id, type, rawTarget, `internal target is invalid (${resolved.reason})`);
      const actual = partName(pkg, resolved.partName);
      if (!actual) return relationshipError(owner, id, type, rawTarget, `internal target resolves to missing package part ${resolved.partName}`);
      if (actual.replace(/^\//, '').toLowerCase() !== resolved.partName.replace(/^\//, '').toLowerCase()) return relationshipError(owner, id, type, rawTarget, `internal target resolves to unexpected package part ${actual} instead of ${resolved.partName}`);
    }
  }
  for (const [owner, part] of pkg.parts) {
    if (owner.includes('/_rels/')) continue;
    const byId = new Map((pkg.relationships.get(owner) ?? []).map(relationship => [relationship.id, relationship]));
    let error: string | null = null;
    const visit = (node: XmlNode) => {
      for (const attribute of node.attributes as { namespaceUri?: string; localName?: string; value?: string }[] | undefined ?? []) {
        if (attribute.namespaceUri !== relationshipsNamespace) continue;
        const id = attribute.value ?? '';
        const relationship = byId.get(id);
        if (!id || !relationship) { error ??= relationshipError(owner, id, '(markup reference)', '(not specified in markup)', 'markup references a relationship ID that does not exist in this source part'); continue; }
        const expected = node.namespaceUri === wordNamespace ? ({ headerReference: 'header', footerReference: 'footer', printerSettings: 'printerSettings' } as Record<string, string>)[node.localName ?? ''] : undefined;
        if (expected && relationship.type.split('/').at(-1) !== expected) error ??= relationshipError(owner, id, relationship.type, relationship.rawTarget, `${node.localName} requires a ${expected} relationship`);
      }
      node.children?.forEach(child => visit(child as XmlNode));
    };
    visit(part.root as unknown as XmlNode);
    if (error) return error;
  }
  return null;
}

function relationshipParserError(bytes: Uint8Array, result: Extract<ReturnType<typeof readOoxmlPackage>, { ok: false }>): string | null {
  if (!result.detail || !['duplicate-relationship-id', 'bad-relationship-target'].includes(result.reason)) return null;
  const duplicate = result.reason === 'duplicate-relationship-id';
  const separator = duplicate ? result.detail.lastIndexOf(': ') : result.detail.indexOf(' -> ');
  if (separator < 0) return null;
  const ownerAndId = duplicate ? result.detail.slice(0, separator) : result.detail.slice(0, separator);
  const split = ownerAndId.lastIndexOf('/');
  const owner = duplicate ? ownerAndId : ownerAndId.slice(0, split), id = duplicate ? result.detail.slice(separator + 2) : ownerAndId.slice(split + 1);
  const reason = duplicate ? 'relationship ID is duplicated within this relationship part' : `internal target is invalid (${result.detail.slice(result.detail.lastIndexOf(': ') + 2)})`;
  const zip = readZip(bytes);
  if (!zip.ok) return null;
  const relsName = relationshipPartName(owner);
  const rels = zip.entries.get(relsName);
  if (!rels) return null;
  const parsed = readXml(new TextDecoder().decode(rels));
  if (!parsed.ok) return null;
  const matches: { type: string; target: string }[] = [];
  const visit = (node: { type: string; name?: string; attributes?: Record<string, string>; children?: readonly never[] }) => {
    if (node.type === 'element' && node.name?.split(':').at(-1) === 'Relationship' && node.attributes?.Id === id) {
      matches.push({ type: node.attributes.Type ?? '', target: node.attributes.Target ?? '' });
    }
    for (const child of node.children ?? []) visit(child as typeof node);
  };
  parsed.nodes.forEach(node => visit(node as typeof parsed.nodes[number] & { type: string; name?: string; attributes?: Record<string, string>; children?: readonly never[] }));
  const relationship = duplicate ? matches[1] : matches[0];
  return relationship ? relationshipError(owner, id, relationship.type, relationship.target, reason) : null;
}

export function checkDocxOutput(bytes: Uint8Array): string | null {
  const result = readOoxmlPackage(bytes);
  return result.ok ? relationshipsAreValid(result.package) : relationshipParserError(bytes, result) ?? 'The saved DOCX is invalid.';
}

export function checkDocxSave(original: Uint8Array, saved: Uint8Array): string | null {
  const before = readOoxmlPackage(original), after = readOoxmlPackage(saved);
  if (!before.ok || !after.ok) return !after.ok ? relationshipParserError(saved, after) ?? 'The saved DOCX is invalid.' : 'The saved DOCX is invalid.';
  const relationshipIssue = relationshipsAreValid(after.package);
  if (relationshipIssue) return relationshipIssue;
  if (!numberingIsPreserved(before.package, after.package)) return 'The saved DOCX changed or removed numbering used by the document.';
  for (const name of before.package.partBytes.keys()) {
    if (after.package.partBytes.has(name)) continue;
    if (name.toLowerCase() === '/word/numbering.xml' && !numberReferences(after.package.parts.get(after.package.mainDocumentPart)?.root as unknown as XmlNode).size && !numberReferences(after.package.parts.get('/word/styles.xml')?.root as unknown as XmlNode).size) continue;
    return `The saved DOCX removed ${name}.`;
  }
  const main = before.package.mainDocumentPart;
  const sourcePart = before.package.parts.get(main), savedPart = after.package.parts.get(main);
  if (!sourcePart || !savedPart || !sectionSettingsArePreserved(sectionSettings(sectionNodes(sourcePart.root as unknown as XmlNode)), sectionSettings(sectionNodes(savedPart.root as unknown as XmlNode)))) return 'The saved DOCX changed page setup or section layout.';
  return null;
}

export function checkDocxOpen(original: Uint8Array, opened: Uint8Array): string | null {
  const before = readOoxmlPackage(original), after = readOoxmlPackage(opened);
  if (!before.ok) return 'Wordcraft could not safely validate this DOCX.';
  if (!after.ok) return relationshipParserError(opened, after) ?? 'Wordcraft could not safely validate this DOCX.';
  if (!numberingIsPreserved(before.package, after.package, true)) return 'This DOCX uses numbering that Wordcraft could not preserve safely.';
  return checkDocxSave(original, opened);
}

const sectionOrder = ['headerReference', 'footerReference', 'footnotePr', 'endnotePr', 'type', 'pgSz', 'pgMar', 'paperSrc', 'pgBorders', 'lnNumType', 'pgNumType', 'cols', 'formProt', 'vAlign', 'noEndnote', 'titlePg', 'textDirection', 'bidi', 'rtlGutter', 'docGrid', 'printerSettings', 'sectPrChange'];

function sectionChildKey(node: XmlNode): string {
  if (node.localName !== 'headerReference' && node.localName !== 'footerReference') return `${node.namespaceUri}:${node.localName}`;
  const type = (node as XmlNode & { attributes?: { namespaceUri?: string; localName?: string; value?: string }[] }).attributes?.find(value => value.namespaceUri === wordNamespace && value.localName === 'type')?.value || 'default';
  return `${node.namespaceUri}:${node.localName}:${type}`;
}

function mergeSectionProperties(source: XmlNode, saved: XmlNode, remapId: (id: string) => string): XmlNode {
  const remapAttribute = (attribute: { namespaceUri?: string; value?: string }) => attribute.namespaceUri === relationshipsNamespace && attribute.value ? { ...attribute, value: remapId(attribute.value) } : attribute;
  const remapNode = (node: XmlNode): XmlNode => ({ ...node,
    attributes: (node.attributes as { namespaceUri?: string; value?: string }[] | undefined)?.map(remapAttribute),
    children: node.children?.map(remapNode),
  });
  const children = [...(saved.children || [])];
  const present = new Set(children.map(sectionChildKey));
  for (const child of source.children || []) {
    if (['headerReference', 'footerReference', 'pgNumType', 'titlePg', 'type'].includes(child.localName || '')) continue;
    if (child.localName === 'pgSz' || child.localName === 'pgMar') {
      const index = children.findIndex(value => sectionChildKey(value) === sectionChildKey(child));
      if (index >= 0) children[index] = child;
      continue;
    }
    if (present.has(sectionChildKey(child))) continue;
    const rank = sectionOrder.indexOf(child.localName || '');
    const index = children.findIndex(value => {
      const nextRank = sectionOrder.indexOf(value.localName || '');
      return nextRank >= 0 && (rank < 0 ? nextRank === sectionOrder.length - 1 : nextRank > rank);
    });
    children.splice(index < 0 ? children.length : index, 0, remapNode(child));
    present.add(sectionChildKey(child));
  }
  const attributes = [...((saved as XmlNode & { attributes?: { namespaceUri?: string; localName?: string }[] }).attributes || [])];
  const attributeKeys = new Set(attributes.map(value => `${value.namespaceUri}:${value.localName}`));
  for (const attribute of (source as XmlNode & { attributes?: { namespaceUri?: string; localName?: string }[] }).attributes || []) {
    if (!attributeKeys.has(`${attribute.namespaceUri}:${attribute.localName}`)) attributes.push(remapAttribute(attribute));
  }
  return { ...saved, children, attributes };
}

export function preserveDocxSectionProperties(original: Uint8Array, saved: Uint8Array): Uint8Array {
  const source = readOoxmlPackage(original), output = readOoxmlPackage(saved), zip = readZip(saved);
  if (!source.ok || !output.ok || !zip.ok) throw Error('The saved DOCX sections could not be preserved.');
  const main = source.package.mainDocumentPart, sourcePart = source.package.parts.get(main), outputPart = output.package.parts.get(output.package.mainDocumentPart);
  if (!sourcePart || !outputPart) throw Error('The saved DOCX is missing its main document.');
  const sections = sectionNodes(sourcePart.root as unknown as XmlNode);
  const outputSections = sectionNodes(outputPart.root as unknown as XmlNode);
  if (!sectionSettingsArePreserved(sectionSettings(sections), sectionSettings(outputSections))) throw Error('The saved DOCX changed page setup or section layout.');
  if (sections.length !== outputSections.length) {
    const error = checkDocxOutput(saved);
    if (error) throw Error(error);
    return saved;
  }
  const outputOwner = output.package.mainDocumentPart;
  const sourceRels = source.package.relationships.get(main) ?? [];
  const outputRels = output.package.relationships.get(outputOwner) ?? [];
  const usedIds = new Set(outputRels.map(relationship => relationship.id));
  const mappedIds = new Map<string, string>();
  const added: { id: string; type: string; target: string; external: boolean }[] = [];
  const remapId = (id: string): string => {
    const prior = mappedIds.get(id);
    if (prior) return prior;
    const sourceRel = sourceRels.find(relationship => relationship.id === id);
    if (!sourceRel) throw Error(relationshipError(main, id, '', '', 'source section references a missing relationship'));
    const external = sourceRel.targetMode === 'External';
    const resolved = external ? null : resolveInternalTarget(main, sourceRel.rawTarget);
    if (resolved && !resolved.ok) throw Error(relationshipError(main, id, sourceRel.type, sourceRel.rawTarget, `internal target is invalid (${resolved.reason})`));
    const target = resolved?.ok ? partName(output.package, resolved.partName) : sourceRel.rawTarget;
    if (!target) throw Error(relationshipError(main, id, sourceRel.type, sourceRel.rawTarget, 'required package part is missing from Wordcraft output'));
    const matching = outputRels.find(relationship => relationship.type === sourceRel.type && relationship.targetMode === sourceRel.targetMode && (external
      ? relationship.rawTarget === target
      : (() => { const value = resolveInternalTarget(outputOwner, relationship.rawTarget); return value.ok && partNameKey(value.partName) === partNameKey(target); })()));
    let nextId = matching?.id ?? id;
    if (!matching) {
      for (let index = 1; usedIds.has(nextId); index++) nextId = `rIdB6H${index}`;
      usedIds.add(nextId);
      added.push({ id: nextId, type: sourceRel.type, target, external });
    }
    mappedIds.set(id, nextId);
    return nextId;
  };
  let index = 0;
  const replace = (node: XmlNode, parent?: XmlNode): XmlNode => {
    if (node.namespaceUri === wordNamespace && node.localName === 'sectPr' && (parent?.localName === 'pPr' || parent?.localName === 'body')) return mergeSectionProperties(structuredClone(sections[index++]), node, remapId);
    if (!node.children) return node;
    return { ...node, children: node.children.map(child => replace(child, node)) };
  };
  const updatedPart = { ...outputPart, root: replace(outputPart.root as unknown as XmlNode) as unknown as typeof outputPart.root };
  const entries = new Map(zip.entries);
  entries.set(output.package.mainDocumentPart, new TextEncoder().encode(serializeOoxmlPart(updatedPart)));
  if (added.length) {
    const name = relationshipPartName(outputOwner);
    const original = entries.get(name);
    if (!original) throw Error(`The saved DOCX is missing ${name}.`);
    const xml = new TextDecoder().decode(original);
    const closing = /<\/(?:[\w.-]+:)?Relationships\s*>/.exec(xml);
    if (!closing) throw Error(`The saved DOCX has an invalid relationship part ${name}.`);
    const prefix = closing[0].match(/^<\/(?:([\w.-]+):)/)?.[1];
    const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const extra = added.map(row => `<${prefix ? `${prefix}:` : ''}Relationship Id="${escape(row.id)}" Type="${escape(row.type)}" Target="${escape(row.target)}"${row.external ? ' TargetMode="External"' : ''}/>`).join('');
    entries.set(name, new TextEncoder().encode(xml.slice(0, closing.index) + extra + xml.slice(closing.index)));
  }
  const merged = writeZip(entries);
  const error = checkDocxOutput(merged);
  if (error) throw Error(error);
  return merged;
}

export function requiredDocumentFonts(bytes: Uint8Array): string[] {
  const result = readOoxmlPackage(bytes);
  if (!result.ok) return [];
  const decoder = new TextDecoder();
  const document = decoder.decode(result.package.partBytes.get(result.package.mainDocumentPart));
  const styles = decoder.decode(result.package.partBytes.get('/word/styles.xml'));
  const defaults = styles.match(/<w:docDefaults\b[\s\S]*?<\/w:docDefaults>/)?.[0] || '';
  const families = new Set<string>();
  for (const match of (defaults + document).matchAll(/<w:rFonts\b[^>]*>/g)) {
    for (const font of match[0].matchAll(/\bw:(?:ascii|hAnsi|eastAsia|cs)="([^"]+)"/g)) families.add(font[1]);
  }
  return [...families.size ? families : ['Calibri']];
}
