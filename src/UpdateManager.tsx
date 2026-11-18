import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import en from './locales/en.json';
import { unsavedWorkspaces } from './unsavedWork';

type Update = { component: string; version: string; releaseId: string; files: number; bytes: number; stagedAt: string };
type RuntimeStatus = { coreVersion: string; activeFrontend: string | null; activeWordcraft: string | null; canRollback: boolean; canRollbackCore: boolean };
type HistoryEntry = { at: string; action: string; component: string; version: string; releaseId: string };
type Progress = { phase: string; component?: string; bytesProcessed: number; totalBytes: number };
type OnlineUpdate = { component: string; version: string; releaseId: string; sequence: number };

export default function UpdateManager({ t }: { t: (key: keyof typeof en) => string }) {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [online, setOnline] = useState<OnlineUpdate[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const refresh = async () => {
    const [staged, status, entries] = await Promise.all([invoke<Update[]>('get_staged_updates'), invoke<RuntimeStatus>('get_update_runtime_status'), invoke<HistoryEntry[]>('get_update_history')]);
    setUpdates(staged);
    setRuntime(status);
    setHistory(entries);
  };
  useEffect(() => { void refresh().catch(error => setStatus(String(error))); }, []);
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<Progress>('update-progress', event => setProgress(event.payload)).then(fn => { if (disposed) fn(); else unlisten = fn; });
    return () => { disposed = true; unlisten?.(); };
  }, []);

  async function importPackage() {
    const selected = await open({ multiple: false, filters: [{ name: 'B6H Update', extensions: ['b6hupdate'] }] });
    if (!selected || Array.isArray(selected)) return;
    setBusy(true);
    setStatus('');
    try {
      const update = await invoke<Update>('install_update_from_file', { file: selected });
      await refresh();
      setStatus(`${t('updateVerified')}: ${update.component} ${update.version}. ${t('updateStagedOnly')}`);
    } catch (error) {
      setStatus(String(error));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function checkOnline() {
    setBusy(true); setStatus(''); setOnline([]);
    try { const found = await invoke<OnlineUpdate[]>('discover_online_updates'); setOnline(found); if (!found.length) setStatus(t('updateNoOnline')); }
    catch (error) { setStatus(String(error)); }
    finally { setBusy(false); }
  }

  async function downloadOnline(update: OnlineUpdate) {
    setBusy(true); setStatus('');
    try { await invoke('download_online_update', { component: update.component, releaseId: update.releaseId }); await refresh(); setStatus(`${t('updateVerified')}: ${update.component} ${update.version}. ${t('updateStagedOnly')}`); }
    catch (error) { setStatus(String(error)); }
    finally { setBusy(false); setProgress(null); }
  }

  async function activate(update: Update) {
    const unsaved = unsavedWorkspaces();
    if (unsaved.length) { setStatus(`${t('updateUnsavedBlock')}: ${unsaved.join(', ')}`); return; }
    if (!window.confirm(t(update.component === 'core' ? 'updateCoreActivateConfirm' : 'updateActivateConfirm'))) return;
    setBusy(true);
    try {
      await invoke('activate_update', { component: update.component, releaseId: update.releaseId });
      if (update.component === 'core') await invoke('launch_core_update');
      else await invoke('restart_application');
    } catch (error) { setStatus(String(error)); setBusy(false); }
  }

  async function rollback() {
    const unsaved = unsavedWorkspaces();
    if (unsaved.length) { setStatus(`${t('updateUnsavedBlock')}: ${unsaved.join(', ')}`); return; }
    if (!window.confirm(t('updateRollbackConfirm'))) return;
    setBusy(true);
    try {
      await invoke('rollback_update');
      await invoke('restart_application');
    } catch (error) { setStatus(String(error)); setBusy(false); }
  }

  async function rollbackCore() {
    const unsaved = unsavedWorkspaces();
    if (unsaved.length) { setStatus(`${t('updateUnsavedBlock')}: ${unsaved.join(', ')}`); return; }
    if (!window.confirm(t('updateCoreRollbackConfirm'))) return;
    setBusy(true);
    try { await invoke('rollback_core_update'); }
    catch (error) { setStatus(String(error)); setBusy(false); }
  }

  return <section className="panel signature-settings-panel">
    <h2>{t('updateManager')}</h2>
    <p className="settings-config-hint">{t('updateManagerDescription')}</p>
    <button className="page-button" type="button" disabled={busy} onClick={() => void checkOnline()}>{t('updateCheckOnline')}</button>
    <button className="primary-button" type="button" disabled={busy} onClick={() => void importPackage()}>{busy ? t('updateVerifying') : t('updateImportPackage')}</button>
    {busy && progress?.phase && <div className="settings-config-actions"><progress max={progress.totalBytes || 1} value={progress.bytesProcessed}/><span>{progress.phase === 'import' && progress.totalBytes ? `${Math.round(100 * progress.bytesProcessed / progress.totalBytes)}%` : t('updateVerifying')}</span><button className="page-button" type="button" onClick={() => void invoke('cancel_update_import').catch(error => setStatus(String(error)))}>{t('updateCancel')}</button></div>}
    {runtime && <p>{t('updateCoreVersion')}: {runtime.coreVersion} · {t('updateFrontendVersion')}: {runtime.activeFrontend ?? t('updateEmbedded')} · {t('updateWordcraftVersion')}: {runtime.activeWordcraft ?? t('updateEmbedded')}</p>}
    <p role="status" aria-live="polite">{status}</p>
    {online.length > 0 && <div className="settings-config-table-wrap"><table className="settings-config-table"><thead><tr><th>{t('updateComponent')}</th><th>{t('updateVersion')}</th><th>{t('updateRelease')}</th><th/></tr></thead><tbody>{online.map(update => <tr key={`${update.component}:${update.releaseId}`}><td>{update.component}</td><td>{update.version}</td><td>{update.releaseId}</td><td><button className="page-button" type="button" disabled={busy} onClick={() => void downloadOnline(update)}>{t('updateDownload')}</button></td></tr>)}</tbody></table></div>}
    {runtime?.canRollback && <button className="page-button" type="button" disabled={busy} onClick={() => void rollback()}>{t('updateRollback')}</button>}
    {runtime?.canRollbackCore && <button className="page-button" type="button" disabled={busy} onClick={() => void rollbackCore()}>{t('updateCoreRollback')}</button>}
    {updates.length > 0 && <div className="settings-config-table-wrap"><table className="settings-config-table"><thead><tr><th>{t('updateComponent')}</th><th>{t('updateVersion')}</th><th>{t('updateRelease')}</th><th/></tr></thead><tbody>{updates.map(update => <tr key={`${update.component}:${update.releaseId}`}><td>{update.component}</td><td>{update.version}</td><td>{update.releaseId}</td><td><button className="page-button" type="button" disabled={busy} onClick={() => void activate(update)}>{t('updateActivate')}</button></td></tr>)}</tbody></table></div>}
    {history.length > 0 && <><h3>{t('updateHistory')}</h3><div className="settings-config-table-wrap"><table className="settings-config-table"><thead><tr><th>{t('updateComponent')}</th><th>{t('updateVersion')}</th><th>{t('updateRelease')}</th><th>{t('updateAction')}</th><th>{t('updateDate')}</th></tr></thead><tbody>{history.slice(-20).reverse().map((entry, index) => <tr key={`${entry.at}:${entry.component}:${index}`}><td>{entry.component}</td><td>{entry.version}</td><td>{entry.releaseId}</td><td>{entry.action}</td><td>{entry.at}</td></tr>)}</tbody></table></div></>}
  </section>;
}
