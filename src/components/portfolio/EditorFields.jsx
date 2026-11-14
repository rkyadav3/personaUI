import { Field, Notice } from '../Ui.jsx';
import { useState } from 'react';
import FormDialog from '../FormDialog.jsx';
import MediaUpload, { UploadGroup } from '../MediaUpload.jsx';
/** One labelled text input or textarea. */
export const Txt = ({ label, value, onChange, max, ph, rows, hint, upload }) => (upload || !rows && /picture|video.*link|link.*video|certificate link|source link|public details link|main link/i.test(label)) ? <MediaUpload label={label} value={value} onChange={onChange} accept={/picture/i.test(label) ? 'image/jpeg,image/png,image/webp,image/gif' : undefined} /> : (
  <Field label={label}>
    {rows
      ? <textarea rows={rows} value={value || ''} maxLength={max} placeholder={ph} onChange={e => onChange(e.target.value)} />
      : <input value={value || ''} maxLength={max} placeholder={ph} onChange={e => onChange(e.target.value)} />}
    {hint && <span className="hint">{hint}</span>}
  </Field>
);

/** A list of cards the owner can add to, remove from and re-order. `children(item, patch)` draws the fields of one card. */
export function Repeater({ items, onChange, blank, max, noun, title, children, validate }) {
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const patch = (i, p) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i, d) => { const a = [...items], j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange(a); };
  return (
    <UploadGroup>{uploading => <fieldset className="editor-fieldset" disabled={uploading}>
      {items.map((it, i) => (
        <div className="card inner" key={i}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <b>{title ? title(it, i) : `${noun} ${i + 1}`}</b>
            <span className="row">
              <button type="button" className="btn small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
              <button type="button" className="btn small" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
              <button type="button" className="btn small danger" onClick={() => onChange(items.filter((_, j) => j !== i))}>Remove</button>
            </span>
          </div>
          {children(it, p => patch(i, p), i)}
        </div>
      ))}
      <button type="button" className="btn" disabled={items.length >= max} onClick={() => { setError(''); setDraft({ ...blank, id: crypto.randomUUID() }); }}>+ Add {noun.toLowerCase()}</button>
      {draft && <FormDialog title={`Add ${noun.toLowerCase()}`} onClose={() => setDraft(null)}><form onSubmit={event => { event.preventDefault(); if (items.length >= max) return; const failure = validate?.(draft); if (failure) { setError(failure); return; } onChange([...items, draft]); setDraft(null); }}>
        {children(draft, value => setDraft(current => ({ ...current, ...value })), items.length)}
        <Notice kind="error">{error}</Notice>
        <div className="row"><button type="submit" className="btn primary">Add {noun.toLowerCase()}</button><button type="button" className="btn" onClick={() => setDraft(null)}>Cancel</button></div>
      </form></FormDialog>}
      {items.length >= max && <span className="hint"> Maximum {max}.</span>}
    </fieldset>}</UploadGroup>
  );
}

