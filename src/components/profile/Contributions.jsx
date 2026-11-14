import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { CATEGORIES, INTENTS } from '../../../shared/profileSchema.js';
import { api } from '../../lib/api.js';
import { Confirm, Field, Notice } from '../Ui.jsx';
import ItemForm from '../commerce/ItemForm.jsx';
import FormDialog from '../FormDialog.jsx';

export function OfferingForm({ contribution, contributions = contribution ? [contribution] : [], offering, onDone }) {
  const item = offering ? { ...offering, kind: 'offering', contributionId: offering.contribution_id || contribution?.id, assetId: offering.delivery_asset_id || '', deliveryKind: offering.delivery_kind || 'file' } : null;
  return <ItemForm item={item} initialCategoryId={contribution?.id} categories={contributions} onDone={onDone} />;
}

function Card({ c, contributions, reload, categoriesOnly }) {
  const [edit, setEdit] = useState(false), [form, setForm] = useState(null);   // form: null | 'new' | offering
  const [d, setD] = useState({ description: c.description, intent: c.intent, subtype: c.subtype });
  const save = patch => api('contributions.save', { ...c, ...d, ...patch }).then(reload);
  return (
    <section className="card">
      <div className="head">
        <h3>{c.category}{c.subtype ? `: ${c.subtype}` : ''}</h3>
        <div className="row">
          {!categoriesOnly && !form && <button type="button" className="btn primary" onClick={() => setForm('new')}>Add item</button>}
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

      {!categoriesOnly && c.offerings.map(o => (
        <div className="tr offer-row" key={o.id}>
          <div><b>{o.title}</b> <span className={`pill ${o.active ? 'active' : 'draft'}`}>{o.active ? 'active' : 'inactive'}</span>
            <div className="muted">{o.pricing}{o.pricing === 'paid' && o.price != null ? ` · ${o.currency || ''} ${o.price}` : ''}</div></div>
          <div className="row end">
            <button className="btn" onClick={() => api('offerings.save', { ...o, contributionId: c.id, active: !o.active }).then(reload)}>{o.active ? 'Deactivate' : 'Activate'}</button>
            <button className="btn" onClick={() => setForm(o)}>Edit</button>
            <Confirm label="Delete" warn="Delete this item?" onConfirm={async () => { await api('offerings.delete', { id: o.id }); reload(); }} />
          </div>
        </div>
      ))}
      {form ? <OfferingForm key={form === 'new' ? 'new' : form.id} contribution={c} contributions={contributions} offering={form === 'new' ? null : form} onDone={changed => { setForm(null); if (changed) reload(); }} />
        : null}
    </section>
  );
}

export default function Contributions({ items, reload, categoriesOnly = false }) {
  const [params] = useSearchParams();
  const [open, setOpen] = useState(params.get('action') === 'add'), [f, setF] = useState({ category: CATEGORIES[0], subtype: '', description: '', intent: 'unspecified' }), [err, setErr] = useState('');
  const [busy, setBusy] = useState(false), [, setParams] = useSearchParams();
  const close = () => { if (busy) return; setOpen(false); if (params.get('action') === 'add') { const next = new URLSearchParams(params); next.delete('action'); setParams(next, { replace: true }); } };
  useEffect(() => { if (params.get('action') === 'add') setOpen(true); }, [params]);
  async function add(e) {
    e.preventDefault(); if (busy) return; setBusy(true); setErr('');
    try { await api('contributions.save', f); setOpen(false); const next = new URLSearchParams(params); next.delete('action'); setParams(next, { replace: true }); setF({ ...f, subtype: '', description: '' }); reload(); } catch (ex) { setErr(ex.message.includes('duplicate') ? 'You already have that category.' : ex.message); }
    finally { setBusy(false); }
  }
  return (
    <>
      {!items.length && <p className="muted">No categories yet. Add one to organize your items.</p>}
      
      {open ? (
        <FormDialog title="Add a category" busy={busy} onClose={close}><form onSubmit={add}>
          <div className="cols c2">
            <Field label="Category"><select value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
            {f.category === 'Other Contributions' && <Field label="What kind"><input type="text" value={f.subtype} placeholder="e.g. Workshops" onChange={e => setF({ ...f, subtype: e.target.value })} /></Field>}
            <Field label="Free or paid"><select value={f.intent} onChange={e => setF({ ...f, intent: e.target.value })}>{INTENTS.map(t => <option key={t}>{t}</option>)}</select></Field>
          </div>
          <Field label="Description"><input type="text" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
          <Notice kind="error">{err}</Notice>
          <div className="row"><button className="btn primary" disabled={busy}>{busy ? 'Adding…' : 'Add category'}</button><button type="button" className="btn" disabled={busy} onClick={close}>Cancel</button></div>
        </form>
        </FormDialog>
      ) : <button className="btn" onClick={() => setOpen(true)}>Add category</button>}
      {items.map(c => <Card key={`${c.id}-${c.updated || ''}`} c={c} contributions={items} reload={reload} categoriesOnly={categoriesOnly} />)}
    </>
  );
}
