import { memo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export type TranslationTableRow = { id: string; number: string; date: string; person: string; document: string; languages: string; certifier: string; copies: string; fee: string; notes: string; [key: string]: string };
const formatFee = (value: string) => { const digits = value.replaceAll(',', '').trim(); if (!digits || !/^\d+$/.test(digits)) return value; const amount = Number(digits); return Number.isSafeInteger(amount) ? amount.toLocaleString('en-US') : digits; };
type TranslationRegisterTableProps = {
  rows: TranslationTableRow[];
  headers: string[];
  customFields: { id: string; header: string }[];
  active: boolean;
  t: (key: string) => string;
  onEdit: (row: TranslationTableRow) => void;
  onDelete: (row: TranslationTableRow) => void;
};

function TranslationRegisterTable({ rows, headers, customFields, active, t, onEdit, onDelete }: TranslationRegisterTableProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => wrapRef.current, estimateSize: () => 58, overscan: 8, getItemKey: index => rows[index].id, enabled: active });
  const virtualRows = virtualizer.getVirtualItems();
  const topPadding = virtualRows[0]?.start ?? 0;
  const bottomPadding = Math.max(0, virtualizer.getTotalSize() - (virtualRows.at(-1)?.end ?? 0));
  const columnCount = headers.length + customFields.length + 1;

  return <div ref={wrapRef} className="translation-table-wrap"><table className="translation-table">
    <thead><tr>{headers.map((header, index) => <th key={index}>{index === 6 ? <span className="translation-th-wrap">{header}</span> : header}</th>)}{customFields.map(field => <th key={field.id}>{field.header}</th>)}<th>{t('translationActions')}</th></tr></thead>
    <tbody>
      {topPadding > 0 && <tr className="virtual-table-spacer" aria-hidden="true"><td colSpan={columnCount} style={{ height: topPadding }} /></tr>}
      {virtualRows.map(item => { const row = rows[item.index]; return <tr key={item.key} data-index={item.index} ref={virtualizer.measureElement}>
        <td>{row.number}</td><td>{row.date}</td><td>{row.person}</td><td>{row.document}</td><td>{row.languages}</td><td>{row.certifier}</td><td>{row.copies}</td><td>{formatFee(row.fee)}</td><td>{row.notes}</td>
        {customFields.map(field => <td key={field.id}>{row[`custom:${field.id}`] ?? ''}</td>)}
        <td><button className="edit-location row-action-edit" onClick={() => onEdit(row)}>{t('edit')}</button><button className="edit-location row-action-delete" onClick={() => onDelete(row)}>{t('translationDelete')}</button></td>
      </tr>; })}
      {bottomPadding > 0 && <tr className="virtual-table-spacer" aria-hidden="true"><td colSpan={columnCount} style={{ height: bottomPadding }} /></tr>}
    </tbody>
  </table></div>;
}

export default memo(TranslationRegisterTable);
