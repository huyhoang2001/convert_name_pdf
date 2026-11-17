import { useState } from 'react';
import { signatureDocumentSuggestions } from './signatureText.mjs';

type Row = { document: string };

export default function TranslationDocumentInput({ value, rows, label, onChange }: { value: string; rows: Row[]; label: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const suggestions = signatureDocumentSuggestions(rows, value);
  const choose = (suggestion: string) => { onChange(suggestion); setOpen(false); setActive(-1); };
  return <span className="signature-document-control"><textarea rows={3} value={value} role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open && suggestions.length > 0} aria-controls="translation-document-suggestions" aria-activedescendant={active >= 0 ? `translation-document-option-${active}` : undefined} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 0)} onChange={event => { onChange(event.target.value); setOpen(true); setActive(-1); }} onKeyDown={event => { if (event.key === 'Escape') setOpen(false); else if (open && suggestions.length && event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(index + 1, suggestions.length - 1)); } else if (open && suggestions.length && event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, 0)); } else if (open && active >= 0 && event.key === 'Enter') { event.preventDefault(); choose(suggestions[active]); } }} />{open && suggestions.length > 0 && <div id="translation-document-suggestions" className="signature-document-suggestions" role="listbox" aria-label={label}>{suggestions.map((suggestion, index) => <div id={`translation-document-option-${index}`} key={suggestion} role="option" aria-selected={active === index} className={active === index ? 'active' : ''} onMouseDown={event => event.preventDefault()} onClick={() => choose(suggestion)}>{suggestion}</div>)}</div>}</span>;
}
