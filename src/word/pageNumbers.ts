import { readOoxmlPackage, readZip, serializeOoxmlPart, writeZip } from '@docx-editor.dev/core/store';

type Node = { kind?: string; namespaceUri?: string; localName?: string; prefix?: string; id?: string; attributes?: readonly Attribute[]; children?: readonly Node[]; value?: string; [key: string]: unknown };
type Attribute = { kind: string; namespaceUri: string; localName: string; prefix: string; value: string };
const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const is = (node: Node, name: string) => node.namespaceUri === word && node.localName === name;
const attr = (node: Node, name: string) => node.attributes?.find(value => value.namespaceUri === word && value.localName === name)?.value;
const pageField = (value: string) => /^(?:PAGE|NUMPAGES|SECTIONPAGES)(?:\s|$)/i.test(value.trim());
const text = (node: Node): string => node.value || node.children?.map(text).join('') || '';

function removeFields(node: Node): Node {
  if (!node.children) return node;
  const children: Node[] = [];
  for (let index = 0; index < node.children.length; index++) {
    const child = node.children[index];
    if (is(child, 'fldSimple') && pageField(attr(child, 'instr') || '')) continue;
    if (is(child, 'r') && child.children?.some(part => is(part, 'fldChar') && attr(part, 'fldCharType') === 'begin')) {
      const end = node.children.findIndex((candidate, next) => next > index && is(candidate, 'r') && candidate.children?.some(part => is(part, 'fldChar') && attr(part, 'fldCharType') === 'end'));
      if (end > index) {
        const sequence = node.children.slice(index, end + 1);
        const instruction = sequence.flatMap(run => run.children || []).filter(part => is(part, 'instrText')).map(text).join('');
        if (pageField(instruction)) {
          if (sequence.some((run, offset) => !is(run, 'r') || run.children?.some(part => !['fldChar', 'instrText', 't', 'rPr'].includes(part.localName || '') || (is(part, 't') && (offset === 0 || offset === sequence.length - 1))))) throw Error('This page field contains other content and cannot be removed safely.');
          index = end;
          continue;
        }
      }
    }
    children.push(removeFields(child));
  }
  if (children.length === node.children.length && children.every((child, index) => child === node.children?.[index])) return node;
  return { ...node, children };
}

function setSectionFormat(root: Node, sectionIndex: number, format: 'decimal' | 'upperRoman' | 'lowerRoman', start: number): Node {
  let current = 0;
  const visit = (node: Node, parent?: Node): Node => {
    if (is(node, 'sectPr') && parent && (is(parent, 'body') || is(parent, 'pPr'))) {
      if (current++ !== sectionIndex) return node;
      const numberType: Node = {
        id: `${node.id || 'section'}.page-number`, kind: 'generic', namespaceUri: word, localName: 'pgNumType', prefix: 'w', namespaceBindings: [], children: [],
        attributes: [
          { kind: 'genericExtension', namespaceUri: word, localName: 'fmt', prefix: 'w', value: format },
          { kind: 'genericExtension', namespaceUri: word, localName: 'start', prefix: 'w', value: String(start) },
        ],
      };
      return { ...node, children: [...(node.children || []).filter(child => !is(child, 'pgNumType')), numberType] };
    }
    return node.children ? { ...node, children: node.children.map(child => visit(child, node)) } : node;
  };
  const result = visit(root);
  if (current <= sectionIndex) throw Error('The selected document section is unavailable.');
  return result;
}

export function changePageNumbers(bytes: Uint8Array, change: { remove?: boolean; partName?: string; sectionIndex?: number; format?: 'decimal' | 'upperRoman' | 'lowerRoman'; start?: number }): Uint8Array {
  const parsed = readOoxmlPackage(bytes), zip = readZip(bytes);
  if (!parsed.ok || !zip.ok) throw Error('The document cannot be updated safely.');
  const entries = new Map(zip.entries);
  for (const [name, part] of parsed.package.parts) {
    if (name !== parsed.package.mainDocumentPart && !/^\/word\/(?:header|footer)\d+\.xml$/.test(name)) continue;
    let root = part.root as unknown as Node;
    if (change.remove && (!change.partName || change.partName === name)) root = removeFields(root);
    if (name === parsed.package.mainDocumentPart && change.format && change.start !== undefined) root = setSectionFormat(root, change.sectionIndex ?? 0, change.format, change.start);
    if (root !== (part.root as unknown as Node)) entries.set(name, new TextEncoder().encode(serializeOoxmlPart({ ...part, root } as unknown as typeof part)));
  }
  const result = writeZip(entries);
  if (!readOoxmlPackage(result).ok) throw Error('The updated document is invalid.');
  return result;
}
