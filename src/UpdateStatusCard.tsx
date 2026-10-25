type Props={status:{kind:'latest';version:string;checkedAt:string};language:'EN'|'VI';checking:boolean;t:(key:'updateTitle'|'updateLatestStatus'|'updateBuildLabel'|'updateLastChecked'|'updateToday'|'updateChecking'|'updateCheckAgain'|'updateUnderstood'|'close')=>string;onCheckAgain:()=>void;onClose:()=>void};

export default function UpdateStatusCard({status,language,checking,t,onCheckAgain,onClose}:Props){
  const vi=language==='VI';
  const time=new Intl.DateTimeFormat(vi?'vi-VN':'en-US',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(status.checkedAt));
  return <div className="report-backdrop update-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="report-dialog update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-status-title">
      <header className="update-card-header"><div><strong>{t('updateTitle')}</strong><span className="update-online-dot" aria-hidden="true"/></div><button className="report-close-icon" type="button" aria-label={t('close')} onClick={onClose}>&#10005;</button></header>
      <div className="update-card-body">
        <span className="update-check-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6.5 12.5 3.7 3.7 7.6-8"/></svg></span>
        <h2 id="update-status-title">{t('updateLatestStatus')}</h2>
        <p className="update-build">{t('updateBuildLabel')} <strong>v{status.version}</strong></p>
        <p className="update-last-checked"><span className="update-online-dot" aria-hidden="true"/>{t('updateLastChecked')}: {t('updateToday')}, {time}</p>
        {checking&&<p className="update-checking" role="status" aria-live="polite">{t('updateChecking')}</p>}
      </div>
      <footer className="update-card-actions"><button className="page-button" type="button" disabled={checking} onClick={onCheckAgain}><span aria-hidden="true">&#8635;</span>{t('updateCheckAgain')}</button><button className="primary-button" type="button" onClick={onClose}>{t('updateUnderstood')}</button></footer>
    </section>
  </div>;
}
