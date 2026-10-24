import { useMemo, useState, type FormEvent } from 'react';
import { compactReferenceNumbers, insertReferenceNumber, nextReferenceNumber } from './copiesSequence';

export type CopiesRow = { id: string; refNo: string; customer: string; description: string; quantity: string; unitPrice: string; totalAmount?: string; manualTotal?: boolean; manualRefNo?: boolean; [key: string]: string | boolean | undefined };
export type CopiesSheet = { id: string; name: string; title: string; address: string; date: string; rows: CopiesRow[] };
type CopiesFile = { file: string; sheets: CopiesSheet[]; sourceMap: Record<string, string> };
type CopiesApi = {
  importCopiesWorkbook: () => Promise<CopiesFile | null>;
  refreshCopiesWorkbook: (file: string) => Promise<CopiesFile>;
  saveCopiesWorkbook: (input: { file: string; sheets: CopiesSheet[]; sourceMap: Record<string, string> }) => Promise<number>;
  newCopiesWorkbook: (sheets: CopiesSheet[]) => Promise<{ file: string; sourceMap: Record<string, string> } | null>;
  exportCopiesWorkbook: (sheets: CopiesSheet[]) => Promise<string | null>;
  clearCopiesCache: () => Promise<boolean>;
};
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const blankSheet = (name = 'Copies'): CopiesSheet => ({ id: crypto.randomUUID(), name, title: 'BẢNG KÊ CHỨNG THỰC BẢN SAO TỪ BẢN CHÍNH - KHÁCH LẺ', address: 'Số 105, Đường Hưng Đạo Vương, Kp. Nam Hà, Phường Trấn Biên, Tp. Đồng Nai', date: today(), rows: [] });
const blankRow = (): CopiesRow => ({ id: '', refNo: '', customer: '', description: '', quantity: '', unitPrice: '1', totalAmount: '', manualTotal: false, manualRefNo: false });
const amount = (value: string | number) => { const number = Number(String(value).replaceAll(',', '')); return Number.isSafeInteger(number) ? number.toLocaleString('en-US') : String(value || ''); };
const rowTotal = (row: CopiesRow) => row.manualTotal ? Number(row.totalAmount || 0) : Math.ceil(Number(row.quantity || 0) * Number(row.unitPrice || 0) / 2) * 10000;
const nextRefNo = (rows: CopiesRow[], sheets: CopiesSheet[], activeId: string) => {
  const sheetIndex = sheets.findIndex(sheet => sheet.id === activeId);
  const previous = sheets.slice(0, sheetIndex).reverse().find(sheet => sheet.rows.length);
  const previousLast = Number(previous?.rows.at(-1)?.refNo) || 0;
  return nextReferenceNumber(rows, previousLast);
};

export default function CopiesPage({ api, t, labels = {} }: { api: CopiesApi; t: (key: string) => string; labels?: Record<string, string> }) {
  const [sheets, setSheets] = useState<CopiesSheet[]>([]);
  const [activeId, setActiveId] = useState(sheets[0]?.id ?? '');
  const [form, setForm] = useState<CopiesRow>(blankRow());
  const [sheetDialog, setSheetDialog] = useState<{ action: 'add' | 'rename'; name: string } | null>(null);
  const [sheetDialogError, setSheetDialogError] = useState('');
  const [query, setQuery] = useState(''), [file, setFile] = useState(''), [sourceMap, setSourceMap] = useState<Record<string, string>>({}), [dirty, setDirty] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const active = sheets.find(sheet => sheet.id === activeId), rows = active?.rows ?? [];
  const label = (key: string, fallback: string) => labels[key]?.trim() || t(fallback);
  const customFields = [...new Set(Object.keys(labels).map(key => key.match(/^custom:([a-f0-9-]{36}):label$/)?.[1]).filter((id): id is string => Boolean(id)))];
  const visibleRows = useMemo(() => rows.filter(row => Object.values(row).join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())), [rows, query]);
  const markDirty = () => { setDirty(true); setMessage(''); };
  const updateRows = (update: (current: CopiesRow[]) => CopiesRow[]) => { setSheets(current => current.map(sheet => sheet.id === activeId ? { ...sheet, rows: update(sheet.rows) } : sheet)); markDirty(); };
  const resequenceSheets = (source: CopiesSheet[], removed?: CopiesRow | CopiesRow[]) => {
    const rows = compactReferenceNumbers(source.flatMap(sheet => sheet.rows), removed);
    const byId = new Map(rows.map(row => [row.id, row]));
    return source.map(sheet => ({ ...sheet, rows: sheet.rows.map(row => byId.get(row.id) ?? row) }));
  };
  const deleteRow = (row: CopiesRow) => {
    const remaining = sheets.map(sheet => sheet.id === activeId ? { ...sheet, rows: sheet.rows.filter(item => item.id !== row.id) } : sheet);
    setSheets(resequenceSheets(remaining, row)); markDirty();
  };
  const insertCustomRow = (row: CopiesRow) => {
    const shifted = insertReferenceNumber(sheets.flatMap(sheet => sheet.rows), row);
    const refById = new Map(shifted.map(item => [item.id, item.refNo]));
    setSheets(sheets.map(sheet => {
      const rows = sheet.rows.map(item => ({ ...item, refNo: refById.get(item.id) ?? item.refNo }));
      if (sheet.id === activeId) rows.push(row);
      rows.sort((a, b) => Number(a.refNo) - Number(b.refNo));
      return { ...sheet, rows };
    })); markDirty();
  };
  const readError = (reason: unknown) => { const message = String(reason).replace(/^Error: /, ''); setError(/workbook could not be replaced|workbook could not be saved|EPERM|EACCES|EBUSY/i.test(message) ? t('copiesWorkbookLocked') : message); };
  const submitSheetName = (event: FormEvent) => {
    event.preventDefault(); if (!sheetDialog) return;
    const name = sheetDialog.name.trim();
    if (!name || name.length > 31 || /[\\/?*:[\]]/.test(name) || sheets.some(sheet => sheet.id !== (sheetDialog.action === 'rename' ? active?.id : undefined) && sheet.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { setSheetDialogError(t('sheetNameInvalid')); return; }
    if (sheetDialog.action === 'add') { const sheet = blankSheet(name); setSheets(current => [...current, sheet]); setActiveId(sheet.id); setForm(blankRow()); }
    else if (active) setSheets(current => current.map(sheet => sheet.id === active.id ? { ...sheet, name } : sheet));
    markDirty(); setError(''); setSheetDialogError(''); setSheetDialog(null);
  };
  const addSheet = () => { setSheetDialogError(''); setSheetDialog({ action: 'add', name: `${t('copies')} ${sheets.length + 1}` }); };
  const renameSheet = () => { if (active) { setSheetDialogError(''); setSheetDialog({ action: 'rename', name: active.name }); } };
  const deleteSheet = () => { if (!active || sheets.length < 2 || !window.confirm(t('copiesDeleteSheetConfirm'))) return; const remaining = sheets.filter(sheet => sheet.id !== active.id); setSheets(resequenceSheets(remaining, active.rows)); setActiveId(remaining[0]?.id ?? ''); setForm(blankRow()); markDirty(); };
  const importFile = async () => { try { if (dirty && !window.confirm(t('copiesImportConfirm'))) return; const imported = await api.importCopiesWorkbook(); if (!imported) return; setSheets(imported.sheets); setActiveId(imported.sheets[0]?.id ?? ''); setFile(imported.file); setSourceMap(imported.sourceMap); setForm(blankRow()); setDirty(false); setMessage(`${imported.sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0)} ${t('translationImported')}`); setError(''); } catch (reason) { readError(reason); } };
  const refresh = async () => { if (!file) return; if (dirty && !window.confirm(t('copiesRefreshConfirm'))) return; try { const refreshed = await api.refreshCopiesWorkbook(file); setSheets(refreshed.sheets); setActiveId(refreshed.sheets[0]?.id ?? ''); setSourceMap(refreshed.sourceMap); setForm(blankRow()); setDirty(false); setMessage(t('copiesRefreshed')); setError(''); } catch (reason) { readError(reason); } };
  const clearCache = async () => { if (!window.confirm(t('copiesClearCacheConfirm'))) return; try { await api.clearCopiesCache(); setSheets([]); setActiveId(''); setFile(''); setSourceMap({}); setForm(blankRow()); setDirty(false); setQuery(''); setMessage(t('copiesCacheCleared')); setError(''); } catch (reason) { readError(reason); } };
  const save = async () => { if (!sheets.length) return; try { if (file) { await api.saveCopiesWorkbook({ file, sheets, sourceMap }); setSourceMap(Object.fromEntries(sheets.map(sheet => [sheet.id, sheet.name]))); } else { const created = await api.newCopiesWorkbook(sheets); if (!created) return; setFile(created.file); setSourceMap(created.sourceMap); } setDirty(false); setMessage(t('copiesSaved')); setError(''); } catch (reason) { readError(reason); } };
  const createFile = async () => { try { const created = await api.newCopiesWorkbook(sheets); if (!created) return; setFile(created.file); setSourceMap(created.sourceMap); setDirty(false); setMessage(t('copiesSaved')); setError(''); } catch (reason) { readError(reason); } };
  const exportFile = async () => { try { const exported = await api.exportCopiesWorkbook(sheets); if (exported) { setMessage(`${t('copiesExported')} ${exported}`); setError(''); } } catch (reason) { readError(reason); } };
  const submit = (event: FormEvent) => {
    event.preventDefault(); if (!active) return;
    const otherRows = rows.filter(item => item.id !== form.id);
    const refNo = form.manualRefNo ? form.refNo.trim() : form.id ? form.refNo : nextRefNo(rows, sheets, activeId);
    const insertCustom = !form.id && form.manualRefNo;
    if (!/^\d+$/.test(form.quantity) || !Number.isSafeInteger(Number(form.quantity)) || !/^\d+$/.test(form.unitPrice) || !Number.isSafeInteger(Number(form.unitPrice)) || (form.manualTotal && (!/^\d+$/.test(form.totalAmount || '') || !Number.isSafeInteger(Number(form.totalAmount)))) || !Number.isSafeInteger(rowTotal(form)) || !/^\d+$/.test(refNo) || (!insertCustom && otherRows.some(item => item.refNo === refNo))) { setError(t('copiesNumbersInvalid')); return; }
    const row = { ...form, id: form.id || crypto.randomUUID(), refNo, totalAmount: String(rowTotal(form)) };
    if (form.id) updateRows(current => current.map(item => item.id === form.id ? row : item));
    else if (insertCustom) insertCustomRow(row);
    else updateRows(current => [...current, row]);
    setForm(blankRow()); setError('');
  };
  const setDate = (date: string) => { if (!active) return; setSheets(current => current.map(sheet => sheet.id === active.id ? { ...sheet, date } : sheet)); markDirty(); };
  return <>
    <div className="page-heading"><div><h1>{t('copies')}</h1><p className="intro">{t('copiesIntro')}</p></div></div>
    <section className="panel translation-panel signature-panel copies-panel">
      <div className="translation-sheetbar">
        <div role="tablist" aria-label={t('copies')}>{sheets.map(sheet => <button type="button" role="tab" aria-selected={sheet.id === activeId} className={sheet.id === activeId ? 'active' : ''} key={sheet.id} onClick={() => { setActiveId(sheet.id); setForm(blankRow()); }}>{sheet.name}</button>)}</div>
        <button className="page-button" type="button" onClick={addSheet}>{t('sheetAdd')}</button>
        <button className="page-button" type="button" disabled={!active} onClick={renameSheet}>{t('sheetRename')}</button>
        <button className="page-button" type="button" disabled={sheets.length < 2} onClick={deleteSheet}>{t('sheetDelete')}</button>
      </div>
      {active ? <form className="translation-form" onSubmit={submit}>
        <h2>{form.id ? t('copiesEdit') : t('copiesAdd')}</h2>
        <div className="translation-fields copies-fields">
          <label className="copies-list-date"><span>{label('field:listDate','copiesHeaderDate')}</span><input type="date" value={active.date} onChange={event => setDate(event.target.value)} /></label>
          <label><span>{label('field:number','copiesNo')}</span><input value={form.id ? rows.findIndex(row => row.id === form.id) + 1 : rows.length + 1} readOnly /></label>
          <label className="copies-refno-field"><span>{label('field:refNo','copiesRefNo')}</span><input inputMode="numeric" value={form.manualRefNo ? form.refNo : form.id ? form.refNo : nextRefNo(rows, sheets, activeId)} readOnly={!form.manualRefNo} onChange={event => /^\d*$/.test(event.target.value) && setForm({ ...form, refNo: event.target.value })} /><span className="copies-total-toggle"><input type="checkbox" checked={Boolean(form.manualRefNo)} onChange={event => setForm({ ...form, manualRefNo: event.target.checked, refNo: event.target.checked ? (form.refNo || nextRefNo(rows, sheets, activeId)) : form.id ? nextRefNo(rows.filter(row => row.id !== form.id), sheets, activeId) : '' })} />{t('copiesCustomRefNo')}</span></label>
          <label><span>{label('field:customer','copiesCustomer')}</span><input required maxLength={20000} value={form.customer} onChange={event => setForm({ ...form, customer: event.target.value })} /></label>
          <label className="copies-description"><span>{label('field:description','copiesDescription')}</span><textarea required rows={2} maxLength={20000} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
          <label className="copies-originals-field"><span>{label('field:quantity','copiesQuantity')}</span><span className="copies-number-control"><button type="button" aria-label="Decrease number of originals" onClick={() => setForm({ ...form, quantity: String(Math.max(1, Number(form.quantity || 1) - 1)) })}>−</button><input required type="text" inputMode="numeric" value={form.quantity} onChange={event => /^\d*$/.test(event.target.value) && setForm({ ...form, quantity: event.target.value })} /><button type="button" aria-label="Increase number of originals" onClick={() => setForm({ ...form, quantity: String(Number(form.quantity || 0) + 1) })}>+</button></span></label>
          <label className="copies-certified-field"><span>{label('field:unitPrice','copiesUnitPrice')}</span><span className="copies-number-control"><button type="button" aria-label="Decrease certified copies" onClick={() => setForm({ ...form, unitPrice: String(Math.max(0, Number(form.unitPrice || 0) - 1)) })}>−</button><input required type="text" inputMode="numeric" value={form.unitPrice} onChange={event => /^\d*$/.test(event.target.value) && setForm({ ...form, unitPrice: event.target.value })} /><button type="button" aria-label="Increase certified copies" onClick={() => setForm({ ...form, unitPrice: String(Number(form.unitPrice || 0) + 1) })}>+</button></span></label>
          <label className="copies-total-field"><span>{label('field:total','copiesTotal')}</span><input type={form.manualTotal ? 'number' : 'text'} min="0" step="1" inputMode="numeric" value={form.manualTotal ? form.totalAmount : amount(rowTotal(form))} readOnly={!form.manualTotal} onChange={event => setForm({ ...form, totalAmount: event.target.value })} /><span className="copies-total-toggle"><input type="checkbox" checked={Boolean(form.manualTotal)} onChange={event => setForm({ ...form, manualTotal: event.target.checked, totalAmount: event.target.checked ? String(rowTotal(form)) : '' })} />{t('copiesManualTotal')}</span></label>
          {customFields.map(id => <label key={id}><span>{labels[`custom:${id}:label`]}</span><input maxLength={20000} value={String(form[`custom:${id}`] ?? '')} onChange={event => setForm({ ...form, [`custom:${id}`]: event.target.value })} /></label>)}
        </div>
        <div className="translation-actions">
          <button className="primary-button" type="submit" disabled={!active}>{form.id ? t('copiesUpdate') : t('copiesAdd')}</button>
          <button type="button" className="page-button" onClick={() => setForm(blankRow())}>{t('translationClear')}</button>
          <button type="button" className="page-button" disabled={!dirty || !active} onClick={() => void save()}>{t('translationSave')}</button>
          <button type="button" className="page-button" disabled={!sheets.length} onClick={() => void exportFile()}>{t('translationExport')}</button>
          <button type="button" className="page-button" onClick={() => void importFile()}>{t('translationImport')}</button>
          <button type="button" className="page-button" disabled={!sheets.length} onClick={() => void createFile()}>{t('translationNewWorkbook')}</button>
        </div>
      </form> : <div className="signature-empty"><p>{t('copiesEmpty')}</p><button className="page-button" type="button" onClick={() => void importFile()}>{t('translationImport')}</button></div>}
      <div className="translation-toolbar">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('translationSearch')} aria-label={t('translationSearch')} disabled={!active} />
        <button type="button" className="page-button" disabled={!file} onClick={() => void refresh()}>{t('translationRefresh')}</button>
        <button type="button" className="page-button" onClick={() => void clearCache()}>{t('copiesClearCache')}</button>
        <span>{visibleRows.length} / {rows.length}</span>{message && <span role="status">{message}</span>}
      </div>
      {active && <div className="translation-table-wrap copies-table-wrap">
        <table className="translation-table copies-table"><thead><tr>{[['number','copiesNo'],['refNo','copiesRefNo'],['customer','copiesCustomer'],['description','copiesDescription'],['quantity','copiesQuantity'],['unitPrice','copiesUnitPrice'],['total','copiesTotal']].map(([key,fallback]) => <th key={key}>{labels[`header:${key}`]?.trim() || t(fallback)}</th>)}{customFields.map(id=><th key={id}>{labels[`custom:${id}:header`]}</th>)}<th>{t('translationActions')}</th></tr></thead>
          <tbody>{visibleRows.map(row => <tr key={row.id}><td>{rows.indexOf(row) + 1}</td><td>{row.refNo}</td><td>{row.customer}</td><td>{row.description}</td><td>{row.quantity}</td><td>{amount(row.unitPrice)}</td><td>{amount(rowTotal(row))}</td>{customFields.map(id=><td key={id}>{String(row[`custom:${id}`] ?? '')}</td>)}<td><button className="edit-location row-action-edit" type="button" onClick={() => setForm({ ...row, quantity: row.quantity, unitPrice: row.unitPrice })}>{t('edit')}</button><button className="edit-location row-action-delete" type="button" onClick={() => { if (window.confirm(t('translationDeleteConfirm'))) deleteRow(row); }}>{t('translationDelete')}</button></td></tr>)}</tbody>
          <tfoot><tr><td colSpan={6}>{t('copiesFooterTotal')}</td><td>{amount(rows.reduce((sum, row) => sum + rowTotal(row), 0))}</td><td colSpan={customFields.length} /><td /></tr><tr><td colSpan={8 + customFields.length}>{t('copiesFooterWords')}</td></tr><tr><td colSpan={3}>{t('copiesFooterInvoice')}</td><td colSpan={5 + customFields.length}>{t('copiesFooterSupplier')}</td></tr><tr><td colSpan={3} /><td colSpan={5 + customFields.length}>{t('copiesFooterSignature')}</td></tr></tfoot>
        </table>
      </div>
      }
    </section>
    {error && <p className="error">{error}</p>}
    {sheetDialog && <div className="report-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSheetDialog(null); }}><section className="report-dialog sheet-dialog" role="dialog" aria-modal="true" aria-labelledby="copies-sheet-dialog-title"><header><div><h2 id="copies-sheet-dialog-title">{t(sheetDialog.action === 'add' ? 'sheetAdd' : 'sheetRename')}</h2><p>{t('copiesSheetNamePrompt')}</p></div><button className="report-close-icon" type="button" aria-label={t('close')} onClick={() => setSheetDialog(null)}>&#10005;</button></header><form onSubmit={submitSheetName}><label className="sheet-name-field"><span>{t('copiesSheetNamePrompt')}</span><input autoFocus maxLength={31} value={sheetDialog.name} onChange={event => setSheetDialog({ ...sheetDialog, name: event.target.value })} /></label>{sheetDialogError && <p className="error" role="alert">{sheetDialogError}</p>}<footer><button className="page-button" type="button" onClick={() => setSheetDialog(null)}>{t('close')}</button><button className="primary-button" type="submit">{t(sheetDialog.action === 'add' ? 'sheetAdd' : 'sheetRename')}</button></footer></form></section></div>}
  </>;
}
