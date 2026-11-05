import { readOoxmlPackage, readZip, serializeOoxmlPart, writeZip } from '@docx-editor.dev/core/store';
import type { Editor } from '@docx-editor.dev/core/contracts/editor';
import type { DocxEditorInstance } from '@docx-editor.dev/core/editor';
import { DocxEditor } from '@docx-editor.dev/editor-api/browser';
import type { Body, RequestContext } from '@docx-editor.dev/editor-api';

type Node = { kind?: string; namespaceUri?: string; localName?: string; prefix?: string; id?: string; attributes?: readonly Attribute[]; children?: readonly Node[]; value?: string; [key: string]: unknown };
type Attribute = { kind: string; namespaceUri: string; localName: string; prefix: string; value: string };
const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const is = (node: Node, name: string) => node.namespaceUri === word && node.localName === name;
const attr = (node: Node, name: string) => node.attributes?.find(value => value.namespaceUri === word && value.localName === name)?.value;
const pageField = (value: string, field = 'PAGE') => new RegExp(`^${field}(?:\\s|$)`, 'i').test(value.trim());
const text = (node: Node): string => node.value || node.children?.map(text).join('') || '';

function simpleField(node: Node | undefined, field: string): boolean {
  return !!node && is(node, 'fldSimple') && pageField(attr(node, 'instr') || '', field);
}

function separatorRun(node: Node | undefined): boolean {
  return !!node && is(node, 'r') && text(node) === ' of ';
}

function removeFields(node: Node): Node {
  if (!node.children) return node;
  const children: Node[] = [];
  let removedPageField = false;
  for (let index = 0; index < node.children.length; index++) {
    const child = node.children[index];
    if (simpleField(child, 'PAGE')) {
      if (separatorRun(node.children[index + 1]) && simpleField(node.children[index + 2], 'NUMPAGES')) index += 2;
      removedPageField = true;
      continue;
    }
    if (is(child, 'r') && child.children?.some(part => is(part, 'fldChar') && attr(part, 'fldCharType') === 'begin')) {
      const end = node.children.findIndex((candidate, next) => next > index && is(candidate, 'r') && candidate.children?.some(part => is(part, 'fldChar') && attr(part, 'fldCharType') === 'end'));
      if (end > index) {
        const sequence = node.children.slice(index, end + 1);
        const instruction = sequence.flatMap(run => run.children || []).filter(part => is(part, 'instrText')).map(text).join('');
        if (pageField(instruction)) {
          if (sequence.some((run, offset) => !is(run, 'r') || run.children?.some(part => !['fldChar', 'instrText', 't', 'rPr'].includes(part.localName || '') || (is(part, 't') && (offset === 0 || offset === sequence.length - 1))))) throw Error('This page field contains other content and cannot be removed safely.');
          index = end;
          removedPageField = true;
          continue;
        }
      }
    }
    children.push(removeFields(child));
  }
  if (is(node, 'p') && removedPageField && children.every(child => is(child, 'pPr') || is(child, 'bookmarkStart') || is(child, 'bookmarkEnd'))) {
    return { ...node, children: children.map(child => is(child, 'pPr') ? { ...child, children: child.children?.filter(part => !is(part, 'jc') && !is(part, 'ind')) } : child) };
  }
  if (children.length === node.children.length && children.every((child, index) => child === node.children?.[index])) return node;
  return { ...node, children };
}

export type PageNumberChange = { remove?: boolean; partName?: string; sectionIndex?: number; format?: string; start?: number; continue?: boolean; chapterStyle?: number; chapterSeparator?: string; clearChapter?: boolean };

async function removePageFields(context: RequestContext, body: Body): Promise<void> {
  const paragraphs = body.paragraphs;
  paragraphs.load('items/text');
  await context.sync();
  const groups = paragraphs.items.map(paragraph => {
    const fields = paragraph.getRange().fields;
    fields.load('items/code');
    return { paragraph, fields };
  });
  await context.sync();
  const pages = groups.flatMap(group => group.fields.items.filter(field => /^PAGE(?:\\s|$)/i.test(field.code.trim())).map(field => ({ ...group, field })));
  if (!pages.length) return;
  for (const { field } of pages) field.result.load('text');
  await context.sync();
  for (const group of groups) {
    const fields = group.fields.items;
    if (fields.length === 1 && /^PAGE(?:\\s|$)/i.test(fields[0].code.trim()) && group.paragraph.text === fields[0].result.text) {
      group.paragraph.alignment = 'Unknown';
      group.paragraph.leftIndent = 0;
      group.paragraph.rightIndent = 0;
      group.paragraph.firstLineIndent = 0;
    }
  }
  for (const { field } of pages) field.delete();
  await context.sync();
}

export async function insertPageNumberField(editor: Editor, input: { position: 'header' | 'footer' | 'current'; align: 'left' | 'center' | 'right'; margin?: boolean; field?: 'PAGE' | 'NUMPAGES' | 'SECTIONPAGES' | 'PAGE_X_OF_Y' }, instance?: DocxEditorInstance): Promise<void> {
  const current = editor.getHeaderFooterState();
  if (input.position === 'current' && !current) throw Error('Open a header or footer before inserting a page number at the current position.');
  if (input.position !== 'current') {
    const target = editor.exec({ type: 'editHeaderFooter', position: input.position, ...(current ? { sectionIndex: current.sectionIndex, variant: current.variant || 'default' } : {}) });
    if (!target.ok) throw Error(target.reason);
    const state = editor.getHeaderFooterState();
    if (!state || !instance) throw Error('The document editor is unavailable.');
    const variant = state.variant === 'first' ? 'FirstPage' : state.variant === 'even' ? 'EvenPages' : 'Primary';
    const history = instance.beginHistoryGroup();
    const pin = instance.retainSelection();
    const runtime = DocxEditor.createBrowser(instance);
    try {
      await runtime.run({ historyGroup: history }, async context => {
        const sections = context.document.sections;
        sections.load('items');
        await context.sync();
        const targetSection = sections.items[state.sectionIndex];
        if (!targetSection) throw Error('The selected section is unavailable.');
        const bodies = [
          { body: targetSection.getHeader(variant), selected: input.position === 'header' },
          { body: targetSection.getFooter(variant), selected: input.position === 'footer' },
        ];
        for (const { body } of bodies) await removePageFields(context, body);
        const targetBody = bodies.find(story => story.selected)!.body;
        const composite = input.field === 'PAGE_X_OF_Y';
        const paragraph = targetBody.insertParagraph(composite ? 'Page ' : '', 'End');
        paragraph.alignment = input.align === 'left' ? 'Left' : input.align === 'right' ? 'Right' : 'Centered';
        if (input.margin) {
          if (input.align === 'right') paragraph.rightIndent = -36;
          else paragraph.leftIndent = -36;
        }
        const range = paragraph.getRange('End');
        range.insertField('After', input.field === 'SECTIONPAGES' ? 'SectionPages' : input.field === 'NUMPAGES' ? 'NumPages' : 'Page');
        await context.sync();
        if (composite) {
          paragraph.getRange('End').insertText(' of ', 'End');
          paragraph.getRange('End').insertField('After', 'NumPages');
          await context.sync();
        }
      });
    } finally {
      runtime.dispose();
      if (pin) instance.releaseSelection(pin);
      history.end();
    }
    return;
  }
  const inserted = editor.exec({ type: 'insertPageField', field: input.field || 'PAGE' });
  if (!inserted.ok) throw Error(inserted.reason);
}

export async function removeAllPageNumberFields(instance: DocxEditorInstance): Promise<void> {
  const history = instance.beginHistoryGroup();
  const runtime = DocxEditor.createBrowser(instance);
  try {
    await runtime.run({ historyGroup: history }, async context => {
      const sections = context.document.sections;
      sections.load('items');
      await context.sync();
      const stories = [context.document.body];
      for (const section of sections.items) for (const variant of ['Primary', 'FirstPage', 'EvenPages'] as const) {
        stories.push(section.getHeader(variant), section.getFooter(variant));
      }
      for (const story of stories) await removePageFields(context, story);
    });
  } finally {
    runtime.dispose();
    history.end();
  }
}

// shortcut: the editor exposes no undoable page-number section command; replace this reload when it does.
function setSectionFormat(root: Node, sectionIndex: number, change: PageNumberChange): Node {
  let current = 0;
  const visit = (node: Node, parent?: Node): Node => {
    if (is(node, 'sectPr') && parent && (is(parent, 'body') || is(parent, 'pPr'))) {
      if (current++ !== sectionIndex) return node;
      const existing = node.children?.find(child => is(child, 'pgNumType'));
      const attributes = (existing?.attributes || []).filter(attribute => {
        if (attribute.namespaceUri !== word) return true;
        const replacingNumber = (attribute.localName === 'fmt' && change.format !== undefined) || (attribute.localName === 'start' && (change.continue || change.start !== undefined));
        const replacingChapter = ['chapStyle', 'chapSep'].includes(attribute.localName) && (change.clearChapter || (attribute.localName === 'chapStyle' && change.chapterStyle !== undefined) || (attribute.localName === 'chapSep' && change.chapterSeparator !== undefined));
        return !replacingNumber && !replacingChapter;
      });
      const set = (name: string, value: string | number | undefined) => {
        if (value !== undefined) attributes.push({ kind: 'genericExtension', namespaceUri: word, localName: name, prefix: 'w', value: String(value) });
      };
      set('fmt', change.format);
      if (!change.continue) set('start', change.start);
      if (!change.clearChapter) {
        set('chapStyle', change.chapterStyle);
        set('chapSep', change.chapterSeparator);
      }
      const children = (node.children || []).filter(child => !is(child, 'pgNumType'));
      if (attributes.length || existing) {
        const numberType: Node = existing ? { ...existing, attributes } : {
          id: `${node.id || 'section'}.page-number`, kind: 'generic', namespaceUri: word, localName: 'pgNumType', prefix: 'w', namespaceBindings: [], children: [], attributes,
        };
        const before = children.findIndex(child => ['cols', 'formProt', 'vAlign', 'noEndnote', 'titlePg', 'textDirection', 'bidi', 'rtlGutter', 'docGrid', 'printerSettings', 'sectPrChange'].includes(child.localName || ''));
        children.splice(before < 0 ? children.length : before, 0, numberType);
      }
      return { ...node, children };
    }
    return node.children ? { ...node, children: node.children.map(child => visit(child, node)) } : node;
  };
  const result = visit(root);
  if (current <= sectionIndex) throw Error('The selected document section is unavailable.');
  return result;
}

export type PageNumberSettings = { sections: number; format: string; start?: number; chapterStyle?: number; chapterSeparator?: string; differentFirstPage: boolean; differentOddEven: boolean };

export function pageNumberSettings(bytes: Uint8Array, sectionIndex = 0): PageNumberSettings {
  const parsed = readOoxmlPackage(bytes);
  if (!parsed.ok) throw Error('The document cannot be read safely.');
  const main = parsed.package.parts.get(parsed.package.mainDocumentPart)?.root as Node | undefined;
  if (!main) throw Error('The document has no main part.');
  const sections: Node[] = [];
  const visit = (node: Node, parent?: Node) => {
    if (is(node, 'sectPr') && parent && (is(parent, 'body') || is(parent, 'pPr'))) sections.push(node);
    node.children?.forEach(child => visit(child, node));
  };
  visit(main);
  const section = sections[sectionIndex];
  if (!section) throw Error('The selected document section is unavailable.');
  const numberType = section.children?.find(child => is(child, 'pgNumType'));
  const settings = parsed.package.parts.get('/word/settings.xml')?.root as Node | undefined;
  return {
    sections: sections.length,
    format: attr(numberType || {}, 'fmt') || 'decimal',
    ...(attr(numberType || {}, 'start') !== undefined ? { start: Number(attr(numberType || {}, 'start')) } : {}),
    ...(attr(numberType || {}, 'chapStyle') !== undefined ? { chapterStyle: Number(attr(numberType || {}, 'chapStyle')) } : {}),
    ...(attr(numberType || {}, 'chapSep') !== undefined ? { chapterSeparator: attr(numberType || {}, 'chapSep') } : {}),
    differentFirstPage: !!section.children?.some(child => is(child, 'titlePg')),
    differentOddEven: !!settings?.children?.some(child => is(child, 'evenAndOddHeaders')),
  };
}

export function changePageNumbers(bytes: Uint8Array, change: PageNumberChange): Uint8Array {
  const parsed = readOoxmlPackage(bytes), zip = readZip(bytes);
  if (!parsed.ok || !zip.ok) throw Error('The document cannot be updated safely.');
  const entries = new Map(zip.entries);
  for (const [name, part] of parsed.package.parts) {
    if (name !== parsed.package.mainDocumentPart && !/^\/word\/(?:header|footer)\d+\.xml$/.test(name)) continue;
    let root = part.root as unknown as Node;
    if (change.remove && (!change.partName || change.partName === name)) root = removeFields(root);
    if (name === parsed.package.mainDocumentPart && (change.format || change.start !== undefined || change.continue || change.chapterStyle !== undefined || change.chapterSeparator !== undefined || change.clearChapter)) root = setSectionFormat(root, change.sectionIndex ?? 0, change);
    if (root !== (part.root as unknown as Node)) entries.set(name, new TextEncoder().encode(serializeOoxmlPart({ ...part, root } as unknown as typeof part)));
  }
  const result = writeZip(entries);
  if (!readOoxmlPackage(result).ok) throw Error('The updated document is invalid.');
  return result;
}
