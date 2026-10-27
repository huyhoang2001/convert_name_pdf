export default function SheetPager({ sheets, activeId, onSelect, t }: {
  sheets: { id: string }[];
  activeId: string;
  onSelect: (id: string) => void;
  t: (key: 'sheetNavigation' | 'previousSheet' | 'nextSheet') => string;
}) {
  const index = sheets.findIndex(sheet => sheet.id === activeId);
  if (index < 0) return null;
  return <nav className="sheet-pager" aria-label={t('sheetNavigation')}>
    <button type="button" disabled={index <= 0} aria-label={t('previousSheet')} title={t('previousSheet')} onClick={() => onSelect(sheets[index - 1].id)}>&#8592;</button>
    <span aria-live="polite">{index + 1}/{sheets.length}</span>
    <button type="button" disabled={index < 0 || index >= sheets.length - 1} aria-label={t('nextSheet')} title={t('nextSheet')} onClick={() => onSelect(sheets[index + 1].id)}>&#8594;</button>
  </nav>;
}
