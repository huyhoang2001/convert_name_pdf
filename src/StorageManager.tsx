import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type en from './locales/en.json';
import { checkMessageKey, storageSelectors, type DestinationKind } from './storageSelectors';
import { WordSettingsPanel } from './word/WordWorkspace';

type T = (key: keyof typeof en) => string;
type Dirs = { backup: string; output: string };
type Feedback = { text: string; error: boolean; state?: string };

export default function StorageManager({ t }: { t: T }) {
  const [active, setActive] = useState(2); // Default to Rename PDFs as in design reference
  const [dirs, setDirs] = useState<Dirs | null>(null);
  const [defaults, setDefaults] = useState<Dirs | null>(null);
  const [busy, setBusy] = useState<Partial<Record<DestinationKind, boolean>>>({});
  const [feedback, setFeedback] = useState<Partial<Record<DestinationKind, Feedback>>>({
    backup: { text: t('storagePathVerified'), error: false, state: 'available' },
    output: { text: t('storagePathVerified'), error: false, state: 'available' },
  });
  const [copied, setCopied] = useState<Partial<Record<DestinationKind, boolean>>>({});
  const busyRef = useRef<Partial<Record<DestinationKind, boolean>>>({});
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const api = window.pdfApp;

  const reload = () => api.getDestinations().then(setDirs);
  useEffect(() => {
    void reload().catch(() => undefined);
    void api.defaultDestinations().then(setDefaults).catch(() => undefined);
  }, []);

  const run = async (kind: DestinationKind, work: () => Promise<Feedback | null>) => {
    if (busyRef.current[kind]) return;
    busyRef.current[kind] = true;
    setBusy({ ...busyRef.current });
    try {
      const result = await work();
      if (result) setFeedback(current => ({ ...current, [kind]: result }));
    } catch (e) {
      await reload().catch(() => undefined);
      setFeedback(current => ({ ...current, [kind]: { text: `${t('storageActionFailed')}: ${String(e)}`, error: true, state: 'failed' } }));
    } finally {
      busyRef.current[kind] = false;
      setBusy({ ...busyRef.current });
    }
  };

  const choose = (kind: DestinationKind) => run(kind, async () => {
    const picked = await api.pickDestination(dirs?.[kind] ?? '');
    if (!picked || picked === dirs?.[kind]) return null;
    const updated = await api.saveDestination(kind, picked);
    setDirs(updated);
    return { text: t('storagePathVerified'), error: false, state: 'available' };
  });

  const open = (kind: DestinationKind) => run(kind, async () => {
    await api.openDestination(kind);
    return null;
  });

  const check = (kind: DestinationKind) => run(kind, async () => {
    const state = await api.checkDestination(kind);
    const isAvail = state === 'available';
    return {
      text: isAvail ? t('storagePathVerified') : t(checkMessageKey[state] ?? 'storageCheckFailed'),
      error: !isAvail,
      state,
    };
  });

  const reset = (kind: DestinationKind) => run(kind, async () => {
    if (!window.confirm(`${t('storageResetConfirm')}\n${defaults?.[kind] ?? ''}`)) return null;
    const updated = await api.resetDestination(kind);
    setDirs(updated);
    return { text: t('storagePathVerified'), error: false, state: 'available' };
  });

  const copyPath = async (kind: DestinationKind) => {
    const val = dirs?.[kind];
    if (!val) return;
    try {
      await navigator.clipboard.writeText(val);
      setCopied(current => ({ ...current, [kind]: true }));
      setTimeout(() => {
        setCopied(current => ({ ...current, [kind]: false }));
      }, 2000);
    } catch {
      // fallback
    }
  };

  const onKey = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (active + step + storageSelectors.length) % storageSelectors.length;
    setActive(next);
    tabs.current[next]?.focus();
  };

  const selector = storageSelectors[active];

  return (
    <div className="storage-layout">
      {/* Left Sidebar Menu */}
      <nav className="storage-sidebar" aria-label={t('storageMenuLabel')}>
        <div className="storage-sidebar-title">{t('storageModules')}</div>
        <div
          className="storage-menu-list"
          role="tablist"
          aria-orientation="vertical"
          onKeyDown={onKey}
        >
          {storageSelectors.map((item, index) => {
            const isSelected = active === index;
            return (
              <button
                type="button"
                role="tab"
                id={`storage-tab-${item.id}`}
                aria-controls="storage-panel"
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                className={`storage-menu-btn ${isSelected ? 'active' : ''}`}
                key={item.id}
                ref={node => {
                  tabs.current[index] = node;
                }}
                onClick={() => setActive(index)}
              >
                <span className="storage-menu-text">{t(item.label)}</span>
                {item.badge && <span className="storage-menu-badge">{t(item.badge)}</span>}
                {isSelected && <span className="storage-menu-dot" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Right Content Panel */}
      <section
        className="storage-content"
        role="tabpanel"
        id="storage-panel"
        aria-labelledby={`storage-tab-${selector.id}`}
      >
        {selector.id === 'word' ? <WordSettingsPanel t={t} /> : selector.fields.length === 0 ? (
          <div className="storage-card empty-card">
            <div className="storage-card-header">
              <div className="storage-card-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div className="storage-card-title-group">
                <h3 className="storage-card-heading">{t(selector.label)}</h3>
                <p className="storage-card-subtext">{t(selector.note)}</p>
              </div>
            </div>
            <div className="storage-card-body">
              <p className="storage-info-note">{t('storageNoteChosenOnSave')}</p>
            </div>
          </div>
        ) : (
          selector.fields.map(([kind, labelKey, tagKey, descKey]) => {
            const currentFeedback = feedback[kind];
            const isVerified = currentFeedback && !currentFeedback.error && currentFeedback.state === 'available';

            return (
              <div className="storage-card" key={kind}>
                {/* Header */}
                <div className="storage-card-header">
                  <div className="storage-card-icon" aria-hidden="true">
                    {kind === 'output' ? (
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    )}
                  </div>
                  <div className="storage-card-title-group">
                    <div className="storage-card-heading-row">
                      <h3 className="storage-card-heading">
                        {t(labelKey)} <span className="storage-card-tag">{t(tagKey)}</span>
                      </h3>
                    </div>
                    <p className="storage-card-subtext">{t(descKey)}</p>
                  </div>
                  {currentFeedback && (
                    <div className={`storage-badge-wrap ${isVerified ? 'verified' : currentFeedback.error ? 'error' : 'normal'}`}>
                      {isVerified ? (
                        <>
                          <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
                            <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z" />
                          </svg>
                          <span>{t('storagePathVerified')}</span>
                        </>
                      ) : (
                        <span>{currentFeedback.text}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="storage-card-body">
                  <div className="storage-label-row">
                    <span className="storage-field-label">{t('storageOutputDirectory')}</span>
                  </div>

                  {/* Path Input Box with Folder Icon and Copy Path Button */}
                  <div className="storage-path-box">
                    <svg className="storage-path-folder-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    <span className="storage-path-value" tabIndex={0}>
                      {dirs ? dirs[kind] : t('storageLoading')}
                    </span>
                    <button
                      type="button"
                      className="storage-copy-path-btn"
                      onClick={() => void copyPath(kind)}
                      title={t('storageCopyPath')}
                    >
                      {copied[kind] ? t('storageCopied') : t('storageCopyPath')}
                    </button>
                  </div>

                  {/* Fallback info */}
                  {defaults && (
                    <div className="storage-fallback-row">
                      <span className="storage-fallback-label">{t('storageDefaultPath')} fallback:</span>
                      <code className="storage-fallback-path">{defaults[kind]}</code>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="storage-actions-toolbar">
                    <div className="storage-actions-left">
                      <button
                        type="button"
                        className="storage-btn-primary"
                        disabled={!dirs || busy[kind]}
                        onClick={() => void choose(kind)}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                        <span>{t('storageChoose')}</span>
                      </button>
                      <button
                        type="button"
                        className="storage-btn-outline"
                        disabled={!dirs || busy[kind]}
                        onClick={() => void open(kind)}
                      >
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                        <span>{t('storageOpenInExplorer')}</span>
                      </button>
                      <button
                        type="button"
                        className="storage-btn-outline"
                        disabled={!dirs || busy[kind]}
                        onClick={() => void check(kind)}
                      >
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="9 12 11 14 15 10" />
                        </svg>
                        <span>{t('storageCheck')}</span>
                      </button>
                    </div>
                    <div className="storage-actions-right">
                      <button
                        type="button"
                        className="storage-btn-outline storage-btn-reset"
                        disabled={!dirs || !defaults || busy[kind]}
                        onClick={() => void reset(kind)}
                      >
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="1 4 1 10 7 10" />
                          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                        </svg>
                        <span>{t('storageReset')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
