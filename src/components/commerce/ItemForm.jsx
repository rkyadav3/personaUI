import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../lib/auth.jsx';
import { readEditorDraft, saveEditorDraft, clearEditorDraft } from '../../lib/editorDrafts.js';
import { api } from '../../lib/api.js';
import { Field, Notice } from '../Ui.jsx';
import MediaUpload from '../MediaUpload.jsx';
import { CHECKOUT_CURRENCIES, MAX_QUANTITY } from '../../../shared/commerce.js';
import { OFFERING_FIELDS } from '../../../shared/profileSchema.js';

export default function ItemForm({ item, initialCategoryId, defaultCurrency = 'INR', categories, version, onDone, onUploadingChange, onBusyChange, dialog = false }) {
  const { user } = useAuth() || {};
  const draftKey = user?.id ? `${user.id}:store:${item ? `${item.kind}:${item.id}` : 'new'}` : null;
  const base = useRef({ title: '', description: '', contributionId: initialCategoryId || '', pricing: 'unspecified', price: '', active: true, assetId: '', deliveryKind: 'file', ...item, currency: item?.currency || defaultCurrency, details: item?.details || {} });
  const cached = useRef(readEditorDraft(draftKey));
  const [form, setForm] = useState(() => cached.current?.form || base.current);
  const expectedVersion = cached.current ? cached.current.version : version;
  const [busy, setBusy] = useState(false), [pending, setPending] = useState(() => new Set()), [error, setError] = useState('');
  const uploading = pending.size > 0, alive = useRef(true), snapshot = useRef(null), discarded = useRef(false);
  const track = key => value => setPending(current => { const next = new Set(current); if (value) next.add(key); else next.delete(key); return next; });
  snapshot.current = { form, version: expectedVersion };
  useEffect(() => { onUploadingChange?.(uploading); }, [uploading, onUploadingChange]);
  useEffect(() => { onBusyChange?.(busy || uploading); }, [busy, uploading, onBusyChange]);
  useEffect(() => {
    alive.current = true;
    const unload = event => { if (JSON.stringify(snapshot.current.form) !== JSON.stringify(base.current)) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    return () => { alive.current = false; window.removeEventListener('beforeunload', unload); if (draftKey && !discarded.current && JSON.stringify(snapshot.current.form) !== JSON.stringify(base.current)) saveEditorDraft(draftKey, snapshot.current); };
  }, [draftKey]);
  const done = changed => { discarded.current = true; clearEditorDraft(draftKey); onDone(changed); };
  const patch = value => setForm(current => ({ ...current, ...value }));
  const category = categories.find(value => String(value.id) === String(form.contributionId));
  const fields = (OFFERING_FIELDS[category?.category] || []).filter(field => !['buy_link', 'cover_image'].includes(field.key));
  async function save(event) {
    event.preventDefault(); if (busy || uploading) return;
    setBusy(true); setError('');
    try { await api('items.save', { ...form, kind: item?.kind || 'offering', expectedVersion, deliveryUrl: '', assetId: form.deliveryKind === 'service' ? '' : form.assetId }); clearEditorDraft(draftKey); discarded.current = true; if (alive.current) onDone(true); }
    catch (failure) { if (alive.current) setError(failure.message); }
    finally { if (alive.current) setBusy(false); }
  }
  return <form className={dialog ? 'item-form item-form-dialog' : 'card item-form'} onSubmit={save}>
    {!dialog && <h2>{item ? 'Edit item' : 'Add item'}</h2>}
    {cached.current && <Notice>Your unsaved item draft was restored. Cancel discards it.</Notice>}
    <fieldset className="editor-fieldset" disabled={busy || uploading}>
      <div className="cols c2"><Field label="Item name"><input required maxLength={item?.kind === 'product' ? 80 : 160} value={form.title} onChange={event => patch({ title: event.target.value })} /></Field>
        {item?.kind === 'product' ? <Field label="Category"><select value={form.category || ''} onChange={event => patch({ category: event.target.value })}><option value="">Uncategorized</option>{[...new Set([...categories.map(value => value.subtype || value.category), ...(form.category ? [form.category] : [])])].map(value => <option key={value}>{value}</option>)}</select></Field> : <Field label="Category"><select aria-label="Item category" required value={form.contributionId} onChange={event => patch({ contributionId: event.target.value })}><option value="">Choose a category</option>{categories.map(value => <option key={value.id} value={value.id}>{value.subtype || value.category}</option>)}</select></Field>}</div>
      <Field label="Description"><textarea rows={4} maxLength={item?.kind === 'product' ? 240 : 1500} value={form.description || ''} onChange={event => patch({ description: event.target.value })} /></Field>
      <MediaUpload label="Cover image" accept="image/jpeg,image/png,image/webp,image/gif" value={item?.kind === 'product' ? form.image : form.details.cover_image} onBusy={track('cover')} onChange={value => item?.kind === 'product' ? patch({ image: value }) : setForm(current => ({ ...current, details: { ...current.details, cover_image: value } }))} />
      <div className="cols c2"><Field label="Price type"><select value={form.pricing} onChange={event => patch({ pricing: event.target.value })}><option value="free">Free</option><option value="paid">Paid</option><option value="unspecified">Information only</option></select></Field>
        {['free', 'paid'].includes(form.pricing) && <Field label="Delivery"><select value={form.deliveryKind} onChange={event => patch({ deliveryKind: event.target.value, ...(event.target.value === 'service' ? { assetId: '' } : {}) })}><option value="file">Download a file</option><option value="service">Service / booking</option></select></Field>}</div>
      {form.pricing === 'paid' && <div className="cols c2"><Field label="Price"><input type="number" required min="0.01" step="0.01" value={form.price ?? ''} onChange={event => patch({ price: event.target.value })} /></Field><Field label="Currency"><select aria-label="Currency" value={form.currency || 'INR'} onChange={event => patch({ currency: event.target.value })}>{CHECKOUT_CURRENCIES.map(code => <option key={code}>{code}</option>)}</select></Field></div>}
      <Field label="Available quantity (optional)"><input aria-label="Available quantity (optional)" type="number" min={0} max={MAX_QUANTITY} step={1} value={form.quantity ?? ''} placeholder="Unlimited" onChange={event => patch({ quantity: event.target.value })} /><span className="hint">Leave blank for unlimited stock or slots. Zero means sold out. Pending checkouts reserve one unit.</span></Field>
      {['free', 'paid'].includes(form.pricing) && (form.deliveryKind === 'file' ? <MediaUpload purpose="delivery" label="Private delivery file" value={form.assetId} onBusy={track('delivery')} onChange={assetId => patch({ assetId })} /> : <p className="hint">Checkout records the booking. Arrange and track delivery with the buyer from Inbox → Purchases.</p>)}
      {item?.deliveryUrl && !form.assetId && <Notice>Replace the previous access link with a file uploaded here. Existing purchase receipts remain available.</Notice>}
      {!!fields.length && <details className="item-more"><summary>Additional details</summary><div className="cols c2">{fields.map(field => <Field key={field.key} label={field.label}>{field.type === 'select' ? <select value={form.details[field.key] || ''} onChange={event => patch({ details: { ...form.details, [field.key]: event.target.value } })}><option value="">Not specified</option>{field.options.map(value => <option key={value}>{value}</option>)}</select> : field.type === 'textarea' ? <textarea rows={3} value={form.details[field.key] || ''} onChange={event => patch({ details: { ...form.details, [field.key]: event.target.value } })} /> : <input value={form.details[field.key] || ''} onChange={event => patch({ details: { ...form.details, [field.key]: event.target.value } })} />}</Field>)}</div></details>}
      {item?.kind !== 'product' && <label className="toggle"><input type="checkbox" checked={form.active} onChange={event => patch({ active: event.target.checked })} />Show this item on my profile</label>}
      <Notice kind="error">{error}</Notice>
      <div className="row"><button type="submit" className="btn primary" disabled={busy || uploading}>{busy ? 'Saving…' : 'Save item'}</button><button type="button" className="btn" disabled={busy || uploading} onClick={() => done(false)}>Cancel</button></div>
    </fieldset>
  </form>;
}
