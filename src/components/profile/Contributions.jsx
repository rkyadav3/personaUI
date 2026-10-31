import { useState } from 'react';
import { CATEGORIES, INTENTS, OFFERING_FIELDS, PRICING } from '../../../shared/profileSchema.js';
import { api } from '../../lib/api.js';
import { Confirm, Field, Notice } from '../Ui.jsx';

const blank = { title: '', description: '', pricing: 'unspecified', price: '', currency: 'INR', active: true, details: {} };

function OfferingForm({ contribution, offering, onDone }) {
  const [f, setF] = useState(offering ? { ...blank, ...offering, price: offering.price ?? '', currency: offering.currency || 'INR' } : blank);
  const [err, setErr] = useState('');
  const fields = OFFERING_FIELDS[contribution.category] || [];
  const det = (k, v) => setF({ ...f, details: { ...f.details, [k]: v } });

  async function submit(e) {
    e.preventDefault(); setErr('');
    try { await api('offerings.save', { ...f, id: offering?.id, contributionId: contribution.id }); onDone(true); } catch (ex) { setErr(ex.message); }
  }
  return (
    <form className="card inner" onSubmit={submit}>
      <Field label="Title *"><input type="text" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="Description"><textarea rows={3} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
      <div className="cols c2">
        {fields.map(d => (
          <Field key={d.key} label={d.label}>
            {d.type === 'select'
              ? <select value={f.details[d.key] || ''} onChange={e => det(d.key, e.target.value)}><option value="">Not specified</option>{d.options.map(o => <option key={o}>{o}</option>)}</select>
              : d.type === 'textarea' ? <textarea rows={2} value={f.details[d.key] || ''} onChange={e => det(d.key, e.target.value)} />
                : <input type="text" value={f.details[d.key] || ''} onChange={e => det(d.key, e.target.value)} />}
          </Field>
        ))}
        <Field label="Free or paid"><select value={f.pricing} onChange={e => setF({ ...f, pricing: e.target.value })}>{PRICING.map(p => <option key={p}>{p}</option>)}</select></Field>
        {f.pricing === 'paid' && (
          <div className="row"><div style={{ width: 90 }}><Field label="Currency"><input type="text" value={f.currency} onChange={e => setF({ ...f, currency: e.target.value })} /></Field></div>
            <div className="grow"><Field label="Price"><input type="number" min={0} step="0.01" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></Field></div></div>
        )}
      </div>
      <label className="toggle"><input type="checkbox" checked={f.active} onChange={e => setF({ ...f, active: e.target.checked })} /> Active (shown on your profile)</label>
      <Notice kind="error">{err}</Notice>
      <div className="row"><button className="btn primary">{offering ? 'Save offering' : 'Add offering'}</button><button type="button" className="btn" onClick={() => onDone(false)}>Cancel</button></div>
    </form>
  );
}

function Card({ c, reload }) {
  const [edit, setEdit] = useState(false), [form, setForm] = useState(null);   // form: null | 'new' | offering
  const [d, setD] = useState({ description: c.description, intent: c.intent, subtype: c.subtype });
  const save = patch => api('contributions.save', { ...c, ...d, ...patch }).then(reload);
  return (
    <section className="card">
      <div className="head">
        <h3>{c.category}{c.subtype ? `: ${c.subtype}` : ''}</h3>
        <div className="row">
          <label className="toggle"><input type="checkbox" checked={c.enabled} onChange={e => save({ enabled: e.target.checked })} /> Offering this</label>
          <label className="toggle"><input type="checkbox" checked={c.visible} onChange={e => save({ visible: e.target.checked })} /> Show on profile</label>
          <button className="btn" onClick={() => setEdit(!edit)}>{edit ? 'Close' : 'Edit'}</button>
          <Confirm label="Remove" warn="Removes this category and all its offerings." onConfirm={async () => { await api('contributions.delete', { id: c.id }); reload(); }} />
        </div>
      </div>
      {edit ? (
        <div className="row sub">
          {c.category === 'Other Contributions' && <input type="text" style={{ width: 150 }} aria-label="Kind" value={d.subtype} onChange={e => setD({ ...d, subtype: e.target.value })} />}
          <input type="text" className="grow" aria-label="Description" value={d.description} onChange={e => setD({ ...d, description: e.target.value })} />
          <select aria-label="Free or paid" value={d.intent} onChange={e => setD({ ...d, intent: e.target.value })}>{INTENTS.map(t => <option key={t}>{t}</option>)}</select>
          <button className="btn primary" onClick={async () => { await save({}); setEdit(false); }}>Save</button>
        </div>
      ) : <p className="muted">{c.description || 'No description.'} <span className="pill draft">{c.intent}</span></p>}

      {c.offerings.map(o => (
        <div className="tr offer-row" key={o.id}>
          <div><b>{o.title}</b> <span className={`pill ${o.active ? 'active' : 'draft'}`}>{o.active ? 'active' : 'inactive'}</span>
            <div className="muted">{o.pricing}{o.pricing === 'paid' && o.price != null ? ` · ${o.currency || ''} ${o.price}` : ''}</div></div>
          <div className="row end">
            <button className="btn" onClick={() => api('offerings.save', { ...o, contributionId: c.id, active: !o.active }).then(reload)}>{o.active ? 'Deactivate' : 'Activate'}</button>
            <button className="btn" onClick={() => setForm(o)}>Edit</button>
            <Confirm label="Delete" warn="Delete this offering?" onConfirm={async () => { await api('offerings.delete', { id: o.id }); reload(); }} />
          </div>
        </div>
      ))}
      {form ? <OfferingForm contribution={c} offering={form === 'new' ? null : form} onDone={changed => { setForm(null); if (changed) reload(); }} />
        : <button className="btn" style={{ marginTop: 10 }} onClick={() => setForm('new')}>Add offering</button>}
    </section>
  );
}

export default function Contributions({ items, reload }) {
  const [open, setOpen] = useState(false), [f, setF] = useState({ category: CATEGORIES[0], subtype: '', description: '', intent: 'unspecified' }), [err, setErr] = useState('');
  async function add(e) {
    e.preventDefault(); setErr('');
    try { await api('contributions.save', f); setOpen(false); setF({ ...f, subtype: '', description: '' }); reload(); } catch (ex) { setErr(ex.message.includes('duplicate') ? 'You already have that category.' : ex.message); }
  }
  return (
    <>
      {!items.length && <p className="muted">No contribution categories yet. Add one to start listing offerings.</p>}
      {items.map(c => <Card key={`${c.id}-${c.updated || ''}`} c={c} reload={reload} />)}
      {open ? (
        <form className="card" onSubmit={add}>
          <h3>Add a category</h3>
          <div className="cols c2">
            <Field label="Category"><select value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
            {f.category === 'Other Contributions' && <Field label="What kind"><input type="text" value={f.subtype} placeholder="e.g. Workshops" onChange={e => setF({ ...f, subtype: e.target.value })} /></Field>}
            <Field label="Free or paid"><select value={f.intent} onChange={e => setF({ ...f, intent: e.target.value })}>{INTENTS.map(t => <option key={t}>{t}</option>)}</select></Field>
          </div>
          <Field label="Description"><input type="text" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
          <Notice kind="error">{err}</Notice>
          <div className="row"><button className="btn primary">Add</button><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      ) : <button className="btn" onClick={() => setOpen(true)}>Add category</button>}
    </>
  );
}
