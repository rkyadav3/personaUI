import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { CATEGORIES, INTENTS, OFFERING_FIELDS, PRICING } from '../../../shared/profileSchema.js';
import { api } from '../../lib/api.js';
import { Confirm, Field, Notice } from '../Ui.jsx';
import { BG_BUCKET } from '../../../shared/siteSettings.js';
import { prepareImage } from '../../lib/image.js';
import { uploadToSigned } from '../../lib/storage.js';
import { CHECKOUT_CURRENCIES } from '../../../shared/commerce.js';

const blank = { title: '', description: '', pricing: 'unspecified', price: '', currency: 'INR', deliveryUrl: '', active: true, details: {} };

export function OfferingForm({ contribution, contributions = contribution ? [contribution] : [], offering, onDone }) {
  const [f, setF] = useState(offering ? { ...blank, ...offering, price: offering.price ?? '', currency: offering.currency || 'INR', deliveryUrl: offering.delivery_url || offering.deliveryUrl || '' } : blank);
  const [categoryId, setCategoryId] = useState(String(offering?.contribution_id ?? contribution?.id ?? ''));
  const [err, setErr] = useState('');
  const selected = contributions.find(item => String(item.id) === categoryId);
  const fields = OFFERING_FIELDS[selected?.category] || [];
  const det = (k, v) => setF({ ...f, details: { ...f.details, [k]: v } });

  async function uploadCover(file) {
    if (!file) return; setErr('');
    try {
      const p = await prepareImage(file), t = await api('site.sign', { type: p.type });
      await uploadToSigned(t.path, t.token, p.blob, BG_BUCKET);
      det('cover_image', `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${BG_BUCKET}/${t.path}`);
    } catch (ex) { setErr(ex.message); }
  }
  async function submit(e) {
    e.preventDefault(); setErr('');
    if (!selected) { setErr('Choose a category for this offering.'); return; }
    try { await api('offerings.save', { ...f, id: offering?.id, contributionId: selected.id }); onDone(true); } catch (ex) { setErr(ex.message); }
  }
  return (
    <form className="card inner" onSubmit={submit}>
      <Field label="Offering category *"><select aria-label="Offering category" required value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="" disabled>Choose a category</option>{contributions.map(item => <option key={item.id} value={String(item.id)}>{item.category}{item.subtype ? `: ${item.subtype}` : ''}</option>)}</select><span className="hint">Categories come from your contributions below. Add a category there to make it available here.</span></Field>
      <Field label="Title *"><input type="text" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="Description"><textarea rows={3} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
      <div className="cols c2">
        {fields.map(d => (
          <Field key={d.key} label={d.key === 'buy_link' ? 'Public details or booking information link (optional)' : d.label}>
            {d.type === 'select'
              ? <select value={f.details[d.key] || ''} onChange={e => det(d.key, e.target.value)}><option value="">Not specified</option>{d.options.map(o => <option key={o}>{o}</option>)}</select>
              : d.type === 'textarea' ? <textarea rows={2} value={f.details[d.key] || ''} onChange={e => det(d.key, e.target.value)} />
                : <><input type="text" value={f.details[d.key] || ''} onChange={e => det(d.key, e.target.value)} />{d.key === 'cover_image' && <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => uploadCover(e.target.files[0])} />}</>}
          </Field>
        ))}
        <Field label="Free or paid"><select value={f.pricing} onChange={e => setF({ ...f, pricing: e.target.value })}>{PRICING.map(p => <option key={p}>{p}</option>)}</select></Field>
        {f.pricing === 'paid' && (
          <div className="row"><div style={{ width: 100 }}><Field label="Currency"><select value={f.currency} onChange={e => setF({ ...f, currency: e.target.value })}>{[...new Set([...CHECKOUT_CURRENCIES, f.currency])].map(code => <option key={code}>{code}</option>)}</select></Field></div>
            <div className="grow"><Field label="Price"><input type="number" min={0.01} step="0.01" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></Field></div></div>
        )}
      </div>
      {['free', 'paid'].includes(f.pricing) && <Field label="Access / download link after checkout"><input type="text" maxLength={600} placeholder="https://…" value={f.deliveryUrl} onChange={e => setF({ ...f, deliveryUrl: e.target.value })} /><span className="hint">Shown to the buyer after a free claim or verified Razorpay payment. Add this link to enable checkout.</span></Field>}
      <label className="toggle"><input type="checkbox" checked={f.active} onChange={e => setF({ ...f, active: e.target.checked })} /> Active (shown on your profile)</label>
      <Notice kind="error">{err}</Notice>
      <div className="row"><button className="btn primary" disabled={!selected}>{offering ? 'Save offering' : 'Add offering'}</button><button type="button" className="btn" onClick={() => onDone(false)}>Cancel</button></div>
    </form>
  );
}

function Card({ c, contributions, reload }) {
  const [edit, setEdit] = useState(false), [form, setForm] = useState(null);   // form: null | 'new' | offering
  const [d, setD] = useState({ description: c.description, intent: c.intent, subtype: c.subtype });
  const save = patch => api('contributions.save', { ...c, ...d, ...patch }).then(reload);
  return (
    <section className="card">
      <div className="head">
        <h3>{c.category}{c.subtype ? `: ${c.subtype}` : ''}</h3>
        <div className="row">
          {!form && <button type="button" className="btn primary" onClick={() => setForm('new')}>Add offering</button>}
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
      {form ? <OfferingForm key={form === 'new' ? 'new' : form.id} contribution={c} contributions={contributions} offering={form === 'new' ? null : form} onDone={changed => { setForm(null); if (changed) reload(); }} />
        : null}
    </section>
  );
}

export default function Contributions({ items, reload }) {
  const [params] = useSearchParams();
  const [open, setOpen] = useState(params.get('action') === 'add'), [f, setF] = useState({ category: CATEGORIES[0], subtype: '', description: '', intent: 'unspecified' }), [err, setErr] = useState('');
  useEffect(() => { if (params.get('action') === 'add') setOpen(true); }, [params]);
  async function add(e) {
    e.preventDefault(); setErr('');
    try { await api('contributions.save', f); setOpen(false); setF({ ...f, subtype: '', description: '' }); reload(); } catch (ex) { setErr(ex.message.includes('duplicate') ? 'You already have that category.' : ex.message); }
  }
  return (
    <>
      {!items.length && <p className="muted">No contribution categories yet. Add one to start listing offerings.</p>}
      
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
      {items.map(c => <Card key={`${c.id}-${c.updated || ''}`} c={c} contributions={items} reload={reload} />)}
    </>
  );
}
