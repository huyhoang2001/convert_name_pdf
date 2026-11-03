import { blankDocumentBytes } from '@docx-editor.dev/core';
import { readOoxmlPackage, readZip, writeZip } from '@docx-editor.dev/core/store';
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
const wordNamespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

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

function sameSectionSettings(left: ReturnType<typeof sectionSettings>, right: ReturnType<typeof sectionSettings>): boolean {
  return left.length === right.length && left.every((section, index) => JSON.stringify(section) === JSON.stringify(right[index]));
}

export function checkDocxSave(original: Uint8Array, saved: Uint8Array): string | null {
  const before = readOoxmlPackage(original), after = readOoxmlPackage(saved);
  if (!before.ok || !after.ok) return 'The saved DOCX is invalid.';
  for (const name of before.package.partBytes.keys()) if (!after.package.partBytes.has(name)) return `The saved DOCX removed ${name}.`;
  const main = before.package.mainDocumentPart;
  const sourcePart = before.package.parts.get(main), savedPart = after.package.parts.get(main);
  if (!sourcePart || !savedPart || !sameSectionSettings(sectionSettings(sectionNodes(sourcePart.root as unknown as XmlNode)), sectionSettings(sectionNodes(savedPart.root as unknown as XmlNode)))) return 'The saved DOCX changed page setup or section layout.';
  return null;
}

export function preserveDocxSectionProperties(original: Uint8Array, saved: Uint8Array): Uint8Array {
  const source = readOoxmlPackage(original), output = readOoxmlPackage(saved), zip = readZip(saved);
  if (!source.ok || !output.ok || !zip.ok) throw Error('The saved DOCX sections could not be preserved.');
  const main = source.package.mainDocumentPart, sourcePart = source.package.parts.get(main), outputPart = output.package.parts.get(output.package.mainDocumentPart);
  if (!sourcePart || !outputPart) throw Error('The saved DOCX is missing its main document.');
  const sections = sectionNodes(sourcePart.root as unknown as XmlNode);
  if (!sameSectionSettings(sectionSettings(sections), sectionSettings(sectionNodes(outputPart.root as unknown as XmlNode)))) throw Error('The saved DOCX changed page setup or section layout.');
  let index = 0;
  const replace = (node: XmlNode, parent?: XmlNode): XmlNode => {
    if (node.namespaceUri === wordNamespace && node.localName === 'sectPr' && (parent?.localName === 'pPr' || parent?.localName === 'body')) return structuredClone(sections[index++]);
    if (!node.children) return node;
    return { ...node, children: node.children.map(child => replace(child, node)) };
  };
  const updatedPart = { ...outputPart, root: replace(outputPart.root as unknown as XmlNode) as unknown as typeof outputPart.root };
  const entries = new Map(zip.entries);
  entries.set(output.package.mainDocumentPart, new TextEncoder().encode(serializeOoxmlPart(updatedPart)));
  return writeZip(entries);
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
