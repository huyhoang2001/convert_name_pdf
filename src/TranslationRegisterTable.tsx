import { memo, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { formatRegisterDate } from './registerDate.mjs';
import { duplicateSignatureNumbers, formatSignatureNumber, splitSearchMatches } from './signatureText.mjs';

export type TranslationTableRow = { id: string; number: string; date: string; person: string; document: string; languages: string; certifier: string; copies: string; fee: string; notes: string; workbookRow?: number; workbookRowEnd?: number; duplicateConfirmed?: boolean; [key: string]: string | number | boolean | undefined };
const formatFee = (value: string) => { const digits = value.replaceAll(',', '').trim(); if (!digits || !/^\d+$/.test(digits)) return value; const amount = Number(digits); return Number.isSafeInteger(amount) ? amount.toLocaleString('en-US') : digits; };
type TranslationRegisterTableProps = {
  rows: TranslationTableRow[];
  headers: string[];
  customFields: { id: string; header: string }[];
  active: boolean;
  t: (key: string) => string;
  onEdit: (row: TranslationTableRow) => void;
  onDelete: (row: TranslationTableRow) => void;
  highlightedId?: string;
  query: string;
};

function SearchText({ value, query }: { value: string; query: string }) {
  return <>{splitSearchMatches(value, query).map((part, index) => part.match ? <mark className="signature-search-match" key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>)}</>;
}

function TranslationRegisterTable({ rows, headers, customFields, active, t, onEdit, onDelete, highlightedId, query }: TranslationRegisterTableProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => wrapRef.current, estimateSize: () => 58, overscan: 8, getItemKey: index => rows[index].id, enabled: active });
  const virtualRows = virtualizer.getVirtualItems();
  const topPadding = virtualRows[0]?.start ?? 0;
  const bottomPadding = Math.max(0, virtualizer.getTotalSize() - (virtualRows.at(-1)?.end ?? 0));
  const columnCount = headers.length + customFields.length + 1;
  const duplicateNumbers = duplicateSignatureNumbers(rows);
  const highlightedIndex = rows.findIndex(row => row.id === highlightedId);
  useEffect(() => { if (!active || highlightedIndex < 0) return; let frame = requestAnimationFrame(() => { virtualizer.scrollToIndex(highlightedIndex, { align: 'center' }); frame = requestAnimationFrame(() => wrapRef.current?.querySelector<HTMLElement>('.signature-row-highlight')?.focus({ preventScroll: true })); }); return () => cancelAnimationFrame(frame); }, [active, highlightedIndex, virtualizer]);

  return <div ref={wrapRef} className="translation-table-wrap"><table className="translation-table">
    <thead><tr>{headers.map((header, index) => <th key={index}>{index === 6 ? <span className="translation-th-wrap">{header}</span> : header}</th>)}{customFields.map(field => <th key={field.id}>{field.header}</th>)}<th>{t('translationActions')}</th></tr></thead>
    <tbody>
      {topPadding > 0 && <tr className="virtual-table-spacer" aria-hidden="true"><td colSpan={columnCount} style={{ height: topPadding }} /></tr>}
      {virtualRows.map(item => { const row = rows[item.index]; return <tr key={item.key} tabIndex={row.id === highlightedId ? -1 : undefined} className={`${row.id === highlightedId ? 'signature-row-highlight' : ''} ${duplicateNumbers.has(Number(row.number)) ? 'signature-duplicate-row' : ''}`} data-index={item.index} ref={virtualizer.measureElement}>
        <td><SearchText value={formatSignatureNumber(row.number)} query={query}/></td><td><SearchText value={formatRegisterDate(row.date)} query={query}/></td><td><SearchText value={row.person} query={query}/></td><td><SearchText value={row.document} query={query}/></td><td><SearchText value={row.languages} query={query}/></td><td><SearchText value={row.certifier} query={query}/></td><td><SearchText value={row.copies} query={query}/></td><td><SearchText value={formatFee(row.fee)} query={query}/></td><td><SearchText value={row.notes} query={query}/></td>
        {customFields.map(field => <td key={field.id}><SearchText value={String(row[`custom:${field.id}`] ?? '')} query={query}/></td>)}
        <td><button className="edit-location row-action-edit" onClick={() => onEdit(row)}>{t('edit')}</button><button className="edit-location row-action-delete" onClick={() => onDelete(row)}>{t('translationDelete')}</button></td>
      </tr>; })}
      {bottomPadding > 0 && <tr className="virtual-table-spacer" aria-hidden="true"><td colSpan={columnCount} style={{ height: bottomPadding }} /></tr>}
    </tbody>
  </table></div>;
}

export default memo(TranslationRegisterTable);
