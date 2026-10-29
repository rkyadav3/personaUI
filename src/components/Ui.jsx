import { useEffect, useRef, useState } from 'react';

export const Pill = ({ status }) => <span className={`pill ${status === 'used up' ? 'used' : status}`}>{status}</span>;

/** items: [{ n, label, sub }] */
export const Stats = ({ items }) => (
  <div className="stats">
    {items.map(i => <div className="stat" key={i.label}><b>{i.n}</b>{i.label}{i.sub && <small>{i.sub}</small>}</div>)}
  </div>
);

/** parts: strings or { label, onClick }. The last part is emphasised. */
export function Crumbs({ parts }) {
  return (
    <div className="crumbs">
      {parts.map((p, i) => {
        const last = i === parts.length - 1, label = typeof p === 'string' ? p : p.label;
        return (
          <span key={i}>
            {i > 0 && ' / '}
            {last ? <b>{label}</b> : p.onClick ? <button onClick={p.onClick}>{label}</button> : label}
          </span>
        );
      })}
    </div>
  );
}

export const Notice = ({ kind = 'info', children }) => children ? <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div> : null;

export const Progress = ({ value }) => <div className="progress"><i style={{ width: `${Math.round(Math.min(1, value) * 100)}%` }} /></div>;

/** Small confirm popover (replaces Streamlit's st.popover): click, read the warning, confirm. */
export function Confirm({ label, warn, confirmLabel = 'Yes, delete', onConfirm, className = 'btn danger' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <span className="pop" ref={ref}>
      <button className={className} onClick={() => setOpen(o => !o)} aria-expanded={open}>{label}</button>
      {open && (
        <div className="box">
          <span className="muted">{warn}</span>
          <button className="btn danger" onClick={async () => { setOpen(false); await onConfirm(); }}>{confirmLabel}</button>
        </div>
      )}
    </span>
  );
}

export const Field = ({ label, children }) => <label className="f">{label}{children}</label>;

export const Loading = ({ error }) => error ? <Notice kind="error">{error}</Notice> : <p className="muted">Loading…</p>;
