import { useEffect, useState, type FormEvent } from 'react';
import en from './locales/en.json';
import vi from './locales/vi.json';

export type ChatKeyStatus = { source: 'saved' | 'environment' | 'none' | 'error'; configured: boolean };

export default function ChatKeySettings({ language, onChange }: { language: 'EN' | 'VI'; onChange: (status: ChatKeyStatus) => void }) {
  const [status, setStatus] = useState<ChatKeyStatus | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<keyof typeof en | null>(null);
  const t = (key: keyof typeof en) => language === 'EN' ? en[key] : vi[key];
  useEffect(() => {
    let active = true;
    window.pdfApp.getChatKeyStatus().then(value => { if (active) setStatus(value); }).catch(() => { if (active) setStatus({ source: 'error', configured: false }); });
    return () => { active = false; };
  }, []);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || /\s/.test(draft)) { setMessage('chatKeyInvalid'); return; }
    setBusy(true);
    try {
      const savedStatus = await window.pdfApp.saveChatKey(draft);
      if (savedStatus.source !== 'saved' || !savedStatus.configured) {
        throw new Error('Could not verify the saved key in Windows Credential Manager.');
      }
      setStatus(savedStatus);
      setDraft('');
      setMessage('chatKeySaved');
      onChange(savedStatus);
    } catch (error) {
      const reason = String(error);
      setMessage(reason.includes('Could not verify the saved key') ? 'chatKeySaveVerifyError' : reason.includes('Secure key storage is unavailable') ? 'chatKeySecureUnavailable' : 'chatKeySaveError');
    }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try {
      const removedStatus = await window.pdfApp.removeChatKey();
      setStatus(removedStatus);
      setDraft('');
      setMessage('chatKeyRemoved');
      onChange(removedStatus);
    } catch { setMessage('chatKeyRemoveError'); }
    finally { setBusy(false); }
  };
  const statusKey = status?.source === 'saved' ? 'chatKeyStatusSaved' : status?.source === 'environment' ? 'chatKeyStatusEnvironment' : status?.source === 'error' ? 'chatKeyStatusError' : 'chatKeyStatusNone';
  return <section className="panel settings-card chat-key-card">
    <div><h2>{t('chatKeyTitle')}</h2><p>{t('chatKeyDescription')}</p></div>
    <form onSubmit={event => void save(event)}>
      <label htmlFor="chat-key-input">{t('chatKeyLabel')}</label>
      <div className="chat-key-controls"><input id="chat-key-input" type="password" autoComplete="new-password" spellCheck={false} maxLength={512} value={draft} onChange={event => { setDraft(event.target.value); setMessage(null); }} placeholder={t('chatKeyPlaceholder')} disabled={busy || !status} aria-describedby="chat-key-status"/><button className="primary-button" type="submit" disabled={busy || !status || !draft}>{busy ? t('settingsSaving') : t('settingsSave')}</button><button className="page-button" type="button" disabled={busy || !status || !['saved', 'error'].includes(status.source)} onClick={() => void remove()}>{t('chatKeyRemove')}</button></div>
      <p id="chat-key-status" role="status">{t(statusKey)}{message && ` ${t(message)}`}</p>
    </form>
  </section>;
}
