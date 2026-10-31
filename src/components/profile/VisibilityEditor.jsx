import { VISIBILITY_LABELS } from '../../../shared/profileSchema.js';

/** Section-level show/hide. Contact details are private until the person ticks them. */
export default function VisibilityEditor({ value, onChange }) {
  const set = fn => { const n = structuredClone(value); fn(n); onChange(n); };
  return (
    <div>
      <label className="toggle"><input type="checkbox" checked disabled /> Name <span className="muted">(always shown)</span></label>
      {Object.entries(VISIBILITY_LABELS).map(([k, l]) => (
        <label className="toggle" key={k}><input type="checkbox" checked={!!value[k]} onChange={e => set(n => { n[k] = e.target.checked; })} /> {l}</label>
      ))}
      <div className="toggle" style={{ display: 'block' }}>
        Contact details <span className="muted">(private by default)</span>
        <div className="row" style={{ marginTop: 4, paddingLeft: 24 }}>
          {['email', 'phone', 'location', 'other'].map(k => (
            <label className="toggle" key={k}><input type="checkbox" checked={!!value.contact[k]} onChange={e => set(n => { n.contact[k] = e.target.checked; })} /> {k[0].toUpperCase() + k.slice(1)}</label>
          ))}
        </div>
      </div>
    </div>
  );
}
