import { Field } from '../Ui.jsx';
/** One labelled text input or textarea. */
export const Txt = ({ label, value, onChange, max, ph, rows, hint }) => (
  <Field label={label}>
    {rows
      ? <textarea rows={rows} value={value || ''} maxLength={max} placeholder={ph} onChange={e => onChange(e.target.value)} />
      : <input value={value || ''} maxLength={max} placeholder={ph} onChange={e => onChange(e.target.value)} />}
    {hint && <span className="hint">{hint}</span>}
  </Field>
);

/** A list of cards the owner can add to, remove from and re-order. `children(item, patch)` draws the fields of one card. */
export function Repeater({ items, onChange, blank, max, noun, title, children }) {
  const patch = (i, p) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i, d) => { const a = [...items], j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange(a); };
  return (
    <>
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
      <button type="button" className="btn" disabled={items.length >= max} onClick={() => onChange([...items, { ...blank, id: crypto.randomUUID() }])}>+ Add {noun.toLowerCase()}</button>
      {items.length >= max && <span className="hint"> Maximum {max}.</span>}
    </>
  );
}

