import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import app from '../package.json';
import en from './locales/en.json';
import { unsavedWorkspaces } from './unsavedWork';
import { formatUpdateTimestamp } from './updateManagerText.mjs';

type Update = { component: string; version: string; releaseId: string; files: number; bytes: number; stagedAt: string };
type RuntimeStatus = { coreVersion: string; activeFrontend: string | null; activeWordcraft: string | null };
type HistoryEntry = { at: string; action: string; component: string; version: string; releaseId: string };
type Progress = { phase: string; component?: string; bytesProcessed: number; totalBytes: number };
type OnlineUpdate = { component: string; version: string; releaseId: string; sequence: number; archiveBytes: number };
type UpdateNotice = { component: string; version: string | null; success: boolean };
type AvailableUpdate = { component: string; version: string; releaseId: string; staged: boolean; archiveBytes?: number };

const noticeKey = 'b6h-update-completed';
const componentKeys: Record<string, keyof typeof en> = {
  core: 'updateCoreVersion', frontend: 'updateFrontendVersion', wordcraft: 'updateWordcraftVersion',
};
const actionKeys: Record<string, keyof typeof en> = {
  import: 'updateHistoryImport', activate: 'updateHistoryActivate', rollback: 'updateHistoryRollback',
};

export default function UpdateManager({ t }: { t: (key: keyof typeof en) => string }) {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [online, setOnline] = useState<OnlineUpdate[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busy, setBusy] = useState(false);
  const [operation, setOperation] = useState<'check' | 'import' | 'download' | 'activate' | null>(null);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'success' | 'error' | 'info'>('info');
  const busyRef = useRef(false);

  const begin = (next: 'check' | 'import' | 'download' | 'activate') => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setOperation(next);
    setBusy(true);
    return true;
  };
  const end = () => { busyRef.current = false; setBusy(false); setOperation(null); setProgress(null); };

  async function refresh() {
    const [staged, active, entries] = await Promise.all([
      invoke<Update[]>('get_staged_updates'),
      invoke<RuntimeStatus>('get_update_runtime_status'),
      invoke<HistoryEntry[]>('get_update_history'),
    ]);
    setUpdates(staged);
    setRuntime(active);
    setHistory(entries);
    return active;
  }

  function showCompletedUpdate() {
    try {
      const raw = localStorage.getItem(noticeKey);
      if (!raw) return;
      localStorage.removeItem(noticeKey);
      const notice = JSON.parse(raw) as UpdateNotice;
      if (!(notice.component in componentKeys)) return;
      setStatus(notice.success ? `${t('updateSuccess')}: ${t(componentKeys[notice.component])} ${notice.version ?? t('updateVersionUnavailable')}` : `${t('updateRecoveredFailure')}: ${t(componentKeys[notice.component])}`);
      setStatusKind(notice.success ? 'success' : 'error');
    } catch { /* Browser storage may be unavailable in restricted WebViews. */ }
  }

  useEffect(() => {
    void refresh().catch(error => { setStatus(`${t('updateFailed')}: ${String(error)}`); setStatusKind('error'); });
    showCompletedUpdate();
    window.addEventListener('b6h-update-ready', showCompletedUpdate);
    return () => window.removeEventListener('b6h-update-ready', showCompletedUpdate);
  }, []);
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<Progress>('update-progress', event => setProgress(event.payload)).then(fn => { if (disposed) fn(); else unlisten = fn; });
    return () => { disposed = true; unlisten?.(); };
  }, []);

  async function importPackage() {
    if (!begin('import')) return;
    setStatus('');
    try {
      const selected = await open({ multiple: false, filters: [{ name: 'B6H Update', extensions: ['b6hupdate'] }] });
      if (!selected || Array.isArray(selected)) return;
      const update = await invoke<Update>('install_update_from_file', { file: selected });
      await refresh();
      setStatus(update.stagedAt === 'already-staged' ? t('updateAlreadyStaged') : `${t('updateVerified')}: ${t(componentKeys[update.component] ?? 'updateUnknownComponent')} ${update.version}. ${t('updateStagedOnly')}`);
      setStatusKind('info');
    } catch (error) {
      setStatus(`${t('updateFailed')}: ${String(error)}`);
      setStatusKind('error');
      await refresh().catch(() => {});
    } finally { end(); }
  }

  async function checkOnline() {
    if (!begin('check')) return;
    setStatus('');
    try {
      const found = await invoke<OnlineUpdate[]>('discover_online_updates');
      const active = await refresh();
      const unique = new Map(found.map(update => [`${update.component}:${update.releaseId}`, update]));
      setOnline([...unique.values()].filter(update => activeVersion(update.component, active) !== update.version));
      if (!found.length) { setStatus(t('updateLatestStatus')); setStatusKind('info'); }
    } catch (error) {
      setStatus(`${t('updateFailed')}: ${String(error)}`);
      setStatusKind('error');
    } finally { end(); }
  }

  async function downloadOnline(update: AvailableUpdate) {
    if (!begin('download')) return;
    setStatus('');
    try {
      await invoke('download_online_update', { component: update.component, releaseId: update.releaseId });
      await refresh();
      setStatus(`${t('updateVerified')}: ${t(componentKeys[update.component] ?? 'updateUnknownComponent')} ${update.version}. ${t('updateStagedOnly')}`);
      setStatusKind('info');
    } catch (error) {
      setStatus(`${t('updateFailed')}: ${String(error)}`);
      setStatusKind('error');
      await refresh().catch(() => {});
    } finally { end(); }
  }

  async function activate(update: AvailableUpdate) {
    if (busyRef.current) return;
    if (runtime && activeVersion(update.component, runtime) === update.version) {
      await refresh();
      setStatus(t('updateAlreadyActive'));
      setStatusKind('info');
      return;
    }
    const unsaved = unsavedWorkspaces();
    if (unsaved.length) { setStatus(`${t('updateUnsavedBlock')}: ${unsaved.join(', ')}`); setStatusKind('error'); return; }
    if (!window.confirm(t(update.component === 'core' ? 'updateCoreActivateConfirm' : 'updateActivateConfirm')) || !begin('activate')) return;
    setStatus('');
    try {
      await invoke('activate_update', { component: update.component, releaseId: update.releaseId });
      await refresh();
      setStatus(t('updateRestarting'));
      setStatusKind('info');
      if (update.component === 'core') await invoke('launch_core_update');
      else await invoke('restart_application');
    } catch (error) {
      setStatus(`${t('updateFailed')}: ${String(error)}`);
      setStatusKind('error');
      await refresh().catch(() => {});
      end();
    }
  }

  const label = (component: string) => t(componentKeys[component] ?? 'updateUnknownComponent');
  const version = (component: string) => component === 'core' ? runtime?.coreVersion : component === 'frontend' ? runtime?.activeFrontend ?? app.version : runtime?.activeWordcraft ?? null;
  const activeVersionFor = (component: string) => runtime ? activeVersion(component, runtime) : null;
  const available = new Map<string, AvailableUpdate>();
  for (const update of online) {
    if (activeVersionFor(update.component) === update.version) continue;
    const key = `${update.component}:${update.releaseId}`;
    const staged = updates.find(item => item.component === update.component && item.releaseId === update.releaseId);
    available.set(key, { component: update.component, version: update.version, releaseId: update.releaseId, staged: !!staged, archiveBytes: update.archiveBytes });
  }
  for (const update of updates) {
    if (activeVersionFor(update.component) === update.version) continue;
    const key = `${update.component}:${update.releaseId}`;
    if (!available.has(key)) available.set(key, { component: update.component, version: update.version, releaseId: update.releaseId, staged: true });
  }

  return <section className="panel signature-settings-panel update-manager">
    <h2>{t('updateManager')}</h2>
    <p className="settings-config-hint">{t('updateManagerDescription')}</p>
    <div className="settings-config-actions">
      <button className="page-button" type="button" disabled={busy} onClick={() => void checkOnline()}>{operation === 'check' ? t('updateChecking') : t('updateCheckOnline')}</button>
      <button className="primary-button" type="button" disabled={busy} onClick={() => void importPackage()}>{operation === 'import' ? t('updateVerifying') : t('updateImportPackage')}</button>
    </div>
    {busy && progress?.phase && <div className="settings-config-actions"><progress max={progress.totalBytes || 1} value={progress.bytesProcessed}/><span>{progress.phase === 'download' ? t('updateDownloading') : progress.phase === 'import' ? t('updateImporting') : t('updateVerifying')}</span><button className="page-button" type="button" onClick={() => void invoke('cancel_update_import').catch(error => { setStatus(`${t('updateFailed')}: ${String(error)}`); setStatusKind('error'); })}>{t('updateCancel')}</button></div>}

    <section className="update-manager-section">
      <h3>{t('updateInstalledComponents')}</h3>
      <div className="settings-config-table-wrap"><table className="settings-config-table"><thead><tr><th>{t('updateComponent')}</th><th>{t('updateVersion')}</th><th>{t('updateStatus')}</th></tr></thead><tbody>
        {['core', 'frontend', 'wordcraft'].map(component => <tr key={component}><td>{label(component)}</td><td>{version(component) ?? t(runtime ? 'updateVersionUnavailable' : 'updateChecking')}</td><td>{runtime ? component === 'core' || component === 'frontend' && runtime.activeFrontend || component === 'wordcraft' && runtime.activeWordcraft ? t('updateActive') : t('updateBundled') : t('updateChecking')}</td></tr>)}
      </tbody></table></div>
    </section>

    <section className="update-manager-section">
      <h3>{t('updateAvailable')}</h3>
      {available.size ? <div className="settings-config-table-wrap"><table className="settings-config-table"><thead><tr><th>{t('updateComponent')}</th><th>{t('updateCurrentVersion')}</th><th>{t('updateVersion')}</th><th>{t('updateDownloadSize')}</th><th>{t('updateRelease')}</th><th>{t('updateStatus')}</th><th>{t('updateAction')}</th></tr></thead><tbody>
        {[...available.values()].map(update => <tr key={`${update.component}:${update.releaseId}`}><td>{label(update.component)}</td><td>{version(update.component) ?? t('updateVersionUnavailable')}</td><td>{update.version}</td><td>{update.archiveBytes == null ? '—' : formatBytes(update.archiveBytes)}</td><td>{update.releaseId}</td><td>{t(update.staged ? 'updateReadyToActivate' : 'updateReadyToDownload')}</td><td><button className={update.staged ? 'primary-button' : 'page-button'} type="button" disabled={busy} onClick={() => void (update.staged ? activate(update) : downloadOnline(update))}>{t(update.staged ? 'updateActivate' : 'updateDownload')}</button></td></tr>)}
      </tbody></table></div> : <p className="settings-config-hint">{t('updateEmpty')}</p>}
    </section>

    <p className="update-manager-status" data-state={statusKind} role="status" aria-live="polite">{status}</p>
    <section className="update-manager-section">
      <h3>{t('updateHistory')}</h3>
      {history.length ? <div className="settings-config-table-wrap"><table className="settings-config-table"><thead><tr><th>{t('updateComponent')}</th><th>{t('updateVersion')}</th><th>{t('updateRelease')}</th><th>{t('updateAction')}</th><th>{t('updateDate')}</th></tr></thead><tbody>
        {history.slice(-20).reverse().map((entry, index) => <tr key={`${entry.at}:${entry.component}:${index}`}><td>{label(entry.component)}</td><td>{entry.version}</td><td>{entry.releaseId}</td><td>{t(actionKeys[entry.action] ?? 'updateHistoryActionOther')}</td><td>{formatUpdateTimestamp(entry.at)}</td></tr>)}
      </tbody></table></div> : <p className="settings-config-hint">{t('updateHistoryEmpty')}</p>}
    </section>
  </section>;
}

function activeVersion(component: string, runtime: RuntimeStatus) {
  return component === 'core' ? runtime.coreVersion : component === 'frontend' ? runtime.activeFrontend ?? app.version : component === 'wordcraft' ? runtime.activeWordcraft : null;
}

function formatBytes(bytes: number) {
  const unit = bytes < 1024 ? 0 : bytes < 1024 ** 2 ? 1 : 2;
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(bytes / 1024 ** unit)} ${['B', 'KB', 'MB'][unit]}`;
}
