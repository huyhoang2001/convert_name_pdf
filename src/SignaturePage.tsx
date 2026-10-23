import { useMemo, useState } from 'react';
import ExcelJS from 'exceljs';
import vi from './locales/vi.json';
import { canEnterSignatureFee } from './signature-fee';

export type SignatureRow = { id: string; number: string; date: string; person: string; document: string; certifier: string; copies: string; fee: string; notes: string };
export type SignatureSheet = { id: string; name: string; rows: SignatureRow[] };
type SignatureApi = {
  importSignatureWorkbook: () => Promise<{ file: string; sheets: SignatureSheet[]; sourceMap: Record<string, string> } | null>;
  refreshSignatureWorkbook: (file: string) => Promise<{ file: string; sheets: SignatureSheet[]; sourceMap: Record<string, string> }> ;
  saveSignatureWorkbook: (input: { file: string; sheets: SignatureSheet[]; sourceMap: Record<string, string> }) => Promise<number>;
  newSignatureWorkbook: (sheets: SignatureSheet[]) => Promise<{ file: string; sourceMap: Record<string, string> } | null>;
};
const headers = [vi.signatureHeaderNumber, vi.signatureHeaderDate, vi.signatureHeaderPerson, vi.signatureHeaderDocument, vi.signatureHeaderSigner, vi.signatureHeaderCount, vi.signatureHeaderFee, vi.signatureHeaderNotes];
const headerKeys = ['signatureHeaderNumber', 'signatureHeaderDate', 'signatureHeaderPerson', 'signatureHeaderDocument', 'signatureHeaderSigner', 'signatureHeaderCount', 'signatureHeaderFee', 'signatureHeaderNotes'];
const keys = ['number', 'date', 'person', 'document', 'certifier', 'copies', 'fee', 'notes'] as const;
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const emptyRow = (): SignatureRow => ({ id: '', number: '', date: today(), person: '', document: '', certifier: '', copies: '1', fee: '', notes: '' });
const reindex = (rows: SignatureRow[]) => rows.map((row, index) => ({ ...row, number: String(index + 1) }));
const money = (value: string) => { const digits = value.trim(); return /^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(digits) && Number.isSafeInteger(Number(digits.replaceAll(',', ''))) ? Number(digits.replaceAll(',', '')).toLocaleString('en-US') : value; };

export default function SignaturePage({ api, t }: { api: SignatureApi; t: (key: string) => string }) {
  const [sheets, setSheets] = useState<SignatureSheet[]>([]), [activeId, setActiveId] = useState(''), [form, setForm] = useState<SignatureRow>(emptyRow());
  const [feeFocused, setFeeFocused] = useState(false);
  const [sheetDialog, setSheetDialog] = useState<{ action: 'add' | 'rename' | 'delete'; name: string } | null>(null);
  const [file, setFile] = useState(''), [sourceMap, setSourceMap] = useState<Record<string, string>>({}), [dirty, setDirty] = useState(false), [query, setQuery] = useState(''), [message, setMessage] = useState(''), [error, setError] = useState('');
  const active = sheets.find(sheet => sheet.id === activeId), rows = active?.rows ?? [];
  const visibleRows = useMemo(() => rows.filter(row => Object.values(row).join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())), [rows, query]);
  const tableHeaders = headerKeys.map(t);
  const updateRows = (update: (current: SignatureRow[]) => SignatureRow[]) => { setSheets(current => current.map(sheet => sheet.id === activeId ? { ...sheet, rows: reindex(update(sheet.rows)) } : sheet)); setDirty(true); setMessage(''); };
  const readError = (reason: unknown) => setError(String(reason).replace(/^Error: /, ''));
  const openSheetDialog = (action: 'add' | 'rename' | 'delete') => setSheetDialog({ action, name: action === 'rename' ? active?.name ?? '' : '' });
  const submitSheetDialog = (event: React.FormEvent) => { event.preventDefault(); if (!sheetDialog) return; if (sheetDialog.action === 'delete') { const remaining = sheets.filter(sheet => sheet.id !== activeId); setSheets(remaining); setActiveId(remaining[0]?.id ?? ''); setForm(emptyRow()); } else { const name = sheetDialog.name.trim(); if (!name || name.length > 31 || /[\\/?*:[\]]/.test(name) || sheets.some(sheet => sheet.id !== activeId && sheet.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { setError(t('sheetNameInvalid')); return; } if (sheetDialog.action === 'add') { const sheet = { id: crypto.randomUUID(), name, rows: [] }; setSheets(current => [...current, sheet]); setActiveId(sheet.id); setForm(emptyRow()); } else setSheets(current => current.map(sheet => sheet.id === activeId ? { ...sheet, name } : sheet)); } setDirty(true); setMessage(''); setError(''); setSheetDialog(null); };
  const importFile = async () => { try { if (dirty && !window.confirm(t('translationRefreshConfirm'))) return; const imported = await api.importSignatureWorkbook(); if (!imported) return; setSheets(imported.sheets.map(sheet => ({ ...sheet, rows: reindex(sheet.rows) }))); setActiveId(imported.sheets[0]?.id ?? ''); setFile(imported.file); setSourceMap(imported.sourceMap); setForm(emptyRow()); setDirty(false); setMessage(`${imported.sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0)} ${t('translationImported')}`); setError(''); } catch (reason) { readError(reason); } };
  const refreshFile = async () => { if (!file) return; if (dirty && !window.confirm(t('signatureRefreshConfirm'))) return; try { const refreshed = await api.refreshSignatureWorkbook(file); setSheets(refreshed.sheets.map(sheet => ({ ...sheet, rows: reindex(sheet.rows) }))); setActiveId(refreshed.sheets[0]?.id ?? ''); setSourceMap(refreshed.sourceMap); setForm(emptyRow()); setDirty(false); setMessage(t('signatureRefreshed')); setError(''); } catch (reason) { readError(reason); } };
  const saveFile = async () => { if (!sheets.length) return; try { if (file) await api.saveSignatureWorkbook({ file, sheets, sourceMap }); else { const created = await api.newSignatureWorkbook(sheets); if (!created) return; setFile(created.file); } setSourceMap(Object.fromEntries(sheets.map(sheet => [sheet.id, sheet.name]))); setDirty(false); setMessage(t('signatureSaved')); setError(''); } catch (reason) { readError(reason); } };
  const createFile = async () => { try { const created = await api.newSignatureWorkbook(sheets); if (!created) return; setFile(created.file); setSourceMap(created.sourceMap); setDirty(false); setMessage(t('signatureSaved')); setError(''); } catch (reason) { readError(reason); } };
  const addRow = (event: React.FormEvent) => { event.preventDefault(); if (!active) return; if (!form.date || !/^\d+$/.test(form.copies || '0') || (form.fee && !/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(form.fee))) { setError(t('translationIntegerInvalid')); return; } if (form.id) updateRows(current => current.map(row => row.id === form.id ? { ...form, fee: form.fee.replaceAll(',', '') } : row)); else updateRows(current => [...current, { ...form, id: crypto.randomUUID(), fee: form.fee.replaceAll(',', '') }]); setForm(emptyRow()); setError(''); };
  const exportFile = async () => { const workbook = new ExcelJS.Workbook(); sheets.forEach((register, index) => { const sheet = workbook.addWorksheet(register.name); const ordered = reindex(register.rows); const data = ordered.map(row => keys.map(key => key === 'number' ? row.number : key === 'fee' || key === 'copies' ? row[key] ? Number(row[key].replaceAll(',', '')) : null : key === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? new Date(Number(row.date.slice(0, 4)), Number(row.date.slice(5, 7)) - 1, Number(row.date.slice(8, 10))) : row[key])); sheet.addTable({ name: `SignatureExport${index + 1}`, ref: 'A1', headerRow: true, totalsRow: false, style: { theme: 'TableStyleLight15', showRowStripes: true }, columns: headers.map(name => ({ name })), rows: data }); sheet.columns = headers.map((header, column) => ({ width: Math.max(14, Math.min(column === 2 ? 48 : column === 3 ? 42 : 32, Math.max(header.length, ...data.map(row => String(row[column] ?? '').length)) + 2)) })); sheet.eachRow({ includeEmpty: false }, row => { row.font = { name: 'Times New Roman', size: 12, bold: row.number === 1 }; row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; let lines = 1; row.eachCell({ includeEmpty: false }, (cell, col) => { lines = Math.max(lines, Math.ceil(String(cell.value ?? '').length / ((sheet.columns[col - 1]?.width ?? 14) * 1.15))); }); row.height = Math.min(240, Math.max(24, lines * 16 + 8)); }); sheet.getColumn(2).numFmt = 'm/d/yyyy'; sheet.getColumn(6).numFmt = '0'; sheet.getColumn(7).numFmt = '#,##0'; }); const buffer = await workbook.xlsx.writeBuffer(); const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); const link = document.createElement('a'); link.href = url; link.download = 'so-chung-thuc-chu-ky.xlsx'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  return <>
    <div className="page-heading"><div><h1>{t('signatureAuthentication')}</h1><p className="intro">{t('signatureIntro')}</p></div></div>
    <section className="panel translation-panel signature-panel">
      <div className="translation-sheetbar">
        <div role="tablist" aria-label={t('signatureAuthentication')}>
          {sheets.map(sheet => <button type="button" role="tab" aria-selected={sheet.id === activeId} className={sheet.id === activeId ? 'active' : ''} key={sheet.id} onClick={() => { setActiveId(sheet.id); setForm(emptyRow()); }}>{sheet.name}</button>)}
        </div>
        <button className="page-button" type="button" onClick={() => openSheetDialog('add')}>{t('sheetAdd')}</button>
        <button className="page-button" type="button" disabled={!active} onClick={() => openSheetDialog('rename')}>{t('sheetRename')}</button>
        <button className="page-button" type="button" disabled={sheets.length < 2} onClick={() => openSheetDialog('delete')}>{t('sheetDelete')}</button>
      </div>
      <form className="translation-form" onSubmit={addRow}>
        <h2>{form.id ? t('signatureEdit') : t('signatureAdd')}</h2>
        <div className="signature-fields">
          <label><span className="signature-field-title">{t('signatureHeaderNumber')}</span><input value={form.id ? form.number : String(rows.length + 1)} readOnly /><small>{t('signatureNumberHint')}</small></label>
          <label><span className="signature-field-title">{t('signatureHeaderDate')}<em className="signature-required">*</em></span><input required type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /><small>{t('signatureDateHint')}</small></label>
          <label className="signature-person"><span className="signature-field-title"><span>{t('signatureRequestor')}</span><span className="signature-label-icons"><em className="signature-required">*</em><span className="translation-info" title={t('signatureHeaderPerson')} aria-label={t('signatureHeaderPerson')}>i</span></span></span><textarea rows={3} required value={form.person} onChange={event => setForm({ ...form, person: event.target.value })} /></label>
          <label className="signature-document"><span className="signature-field-title">{t('signatureDocument')}</span><input value={form.document} onChange={event => setForm({ ...form, document: event.target.value })} /></label>
          <label className="signature-copies"><span className="signature-field-title">{t('signatureCopiesInput')}</span><span className="signature-stepper"><button type="button" aria-label="Decrease copies" onClick={() => setForm({ ...form, copies: String(Math.max(1, Number(form.copies || 1) - 1)) })}>-</button><input inputMode="numeric" value={form.copies} onChange={event => /^\d*$/.test(event.target.value) && setForm({ ...form, copies: event.target.value })} /><button type="button" aria-label="Increase copies" onClick={() => setForm({ ...form, copies: String(Number(form.copies || 0) + 1) })}>+</button></span></label>
          <label className="signature-fee"><span className="signature-field-title">{t('signatureFeeInput')}</span><span className="signature-money"><input inputMode="numeric" value={feeFocused ? form.fee.replaceAll(',', '') : money(form.fee)} onFocus={() => setFeeFocused(true)} onChange={event => canEnterSignatureFee(event.target.value) && setForm({ ...form, fee: event.target.value })} onBlur={() => setFeeFocused(false)} /><span>VND</span></span></label>
          <label className="signature-notes"><span className="signature-field-title">{t('signatureNotesInput')}</span><input value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label>
        </div>
        <div className="translation-actions">
          <button className="primary-button" type="submit" disabled={!active}>{form.id ? t('translationUpdate') : t('signatureAdd')}</button>
          <button type="button" className="page-button" onClick={() => setForm(emptyRow())}>{t('translationClear')}</button>
          <button type="button" className="page-button" disabled={!dirty || !sheets.length} onClick={() => void saveFile()}>{t('translationSave')}</button>
          <button type="button" className="page-button" disabled={!sheets.length} onClick={() => void exportFile()}>{t('translationExport')}</button>
          <button type="button" className="page-button" onClick={() => void importFile()}>{t('translationImport')}</button>
          <button type="button" className="page-button" disabled={!sheets.length} onClick={() => void createFile()}>{t('translationNewWorkbook')}</button>
        </div>
      </form>
      <div className="translation-toolbar">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('translationSearch')} aria-label={t('translationSearch')} />
        <button type="button" className="page-button" disabled={!file} onClick={() => void refreshFile()}>{t('translationRefresh')}</button>
        <span>{visibleRows.length} / {rows.length}</span>{message && <span role="status">{message}</span>}
      </div>
      {sheets.length ? <div className="translation-table-wrap"><table className="translation-table signature-table">
        <thead><tr>{tableHeaders.map(header => <th key={header}>{header}</th>)}<th>{t('translationActions')}</th></tr></thead>
        <tbody>{visibleRows.map(row => <tr key={row.id}><td>{row.number}</td><td>{row.date}</td><td>{row.person}</td><td>{row.document}</td><td>{row.certifier}</td><td>{row.copies}</td><td>{money(row.fee)}</td><td>{row.notes}</td><td><button className="edit-location" type="button" onClick={() => setForm({ ...row, fee: money(row.fee) })}>{t('edit')}</button><button className="edit-location" type="button" onClick={() => { if (window.confirm(t('translationDeleteConfirm'))) updateRows(current => current.filter(item => item.id !== row.id)); }}>{t('translationDelete')}</button></td></tr>)}</tbody>
      </table></div> : <p className="signature-empty">{t('signatureEmpty')}</p>}
    </section>
    {sheetDialog && <div className="report-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSheetDialog(null); }}><section className="report-dialog sheet-dialog" role={sheetDialog.action === 'delete' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="signature-sheet-dialog-title"><header><div><h2 id="signature-sheet-dialog-title">{t(sheetDialog.action === 'add' ? 'sheetAdd' : sheetDialog.action === 'rename' ? 'sheetRename' : 'sheetDelete')}</h2><p>{sheetDialog.action === 'delete' ? t('sheetDeleteConfirm') : t('sheetNamePrompt')}</p></div><button className="report-close-icon" type="button" aria-label={t('close')} onClick={() => setSheetDialog(null)}>&#10005;</button></header><form onSubmit={submitSheetDialog}>{sheetDialog.action !== 'delete' && <label className="sheet-name-field"><span>{t('sheetNamePrompt')}</span><input autoFocus maxLength={31} value={sheetDialog.name} onChange={event => setSheetDialog({ ...sheetDialog, name: event.target.value })} /></label>}<footer><button className="page-button" type="button" onClick={() => setSheetDialog(null)}>{t('close')}</button><button className="primary-button" type="submit">{t(sheetDialog.action === 'add' ? 'sheetAdd' : sheetDialog.action === 'rename' ? 'sheetRename' : 'sheetDelete')}</button></footer></form></section></div>}
    {error && <p className="error">{error}</p>}
  </>;
}
