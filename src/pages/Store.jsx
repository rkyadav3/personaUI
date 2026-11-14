import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useOp } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { Loading, Notice, Confirm } from '../components/Ui.jsx';
import Contributions from '../components/profile/Contributions.jsx';
import ItemForm from '../components/commerce/ItemForm.jsx';
import FormDialog from '../components/FormDialog.jsx';
import StoreCurrencySettings from '../components/commerce/StoreCurrencySettings.jsx';
import '../styles/portfolioEditor.css';

export default function Store() {
  const { data, error, reload } = useOp('items.list');
  const [params, setParams] = useSearchParams(), [form, setForm] = useState(null), [query, setQuery] = useState(''), [message, setMessage] = useState(''), [uploading, setUploading] = useState(false);
  const tab = params.get('tab') === 'categories' ? 'categories' : 'items';
  const [dialogBusy, setDialogBusy] = useState(false);
  const navigate = next => { const search = new URLSearchParams(params); search.set('tab', next); search.delete('action'); setParams(search); setForm(null); };
  if (!data) return <Loading label="Loading Store…" error={error} />;
  const items = data.items.filter(item => `${item.title} ${item.categoryName}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="portfolio-editor store-manager">
    <div className="head"><div><h1>Store</h1><p className="muted">Items are what you share or sell. Categories help visitors find them.</p></div><div className="row"><button type="button" className="btn primary" disabled={!!form} onClick={() => { navigate('items'); setForm('new'); }}>Add item</button><button type="button" className="btn" disabled={uploading} onClick={() => { const search = new URLSearchParams(params); search.set('tab', 'categories'); search.set('action', 'add'); setParams(search); setForm(null); }}>Add category</button><Link className="btn" aria-disabled={uploading || undefined} onClick={event => { if (uploading) event.preventDefault(); }} to="/admin/settings?tab=store">Customize page</Link></div></div>
    <Notice kind="error">{message}</Notice>
    <StoreCurrencySettings data={data} onSaved={reload} disabled={!!form || uploading} />
    <nav className="pp-tabs" aria-label="Store areas">{['items', 'categories'].map(value => <button type="button" key={value} disabled={uploading} className={tab === value ? 'on' : ''} aria-current={tab === value ? 'page' : undefined} onClick={() => navigate(value)}>{value === 'items' ? 'Items' : 'Categories'}</button>)}</nav>
    {tab === 'categories' ? <Contributions categoriesOnly items={data.categories} reload={reload} /> : <>
      {form && <FormDialog title={form === 'new' ? 'Add item' : 'Edit item'} busy={dialogBusy} onClose={() => setForm(null)}><ItemForm dialog key={form === 'new' ? 'new' : `${form.kind}:${form.id}`} item={form === 'new' ? null : form} defaultCurrency={data.currency} categories={data.categories} version={data.version} onUploadingChange={setUploading} onBusyChange={setDialogBusy} onDone={changed => { setDialogBusy(false); setForm(null); if (changed) reload(); }} /></FormDialog>}
      {!data.categories.length && <Notice>Add a category first to group new items, such as Books or Services.</Notice>}
      <label className="f store-search">Find an item<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by name or category" /></label>
      <section className="card store-items"><h2>Your items</h2>{!items.length && <p className="muted">{query ? 'No items match your search.' : 'No items yet. Add a category, then your first item.'}</p>}{items.map(item => <div className="tr" key={`${item.kind}:${item.id}`}><div className="grow"><b>{item.title}</b><p className="muted">{item.categoryName} · {item.pricing === 'unspecified' ? 'Information only' : item.pricing === 'paid' ? `${item.currency} ${item.price}` : 'Free'}{item.quantity != null ? item.quantity === 0 ? ' · Sold out' : ` · ${item.quantity} available` : ''}{!item.active ? ' · Hidden' : ''}</p></div><div className="row"><button type="button" className="btn" disabled={!!form} onClick={() => setForm(item)}>Edit</button><Confirm label="Delete" warn="Delete this item? Existing purchases remain on record." onConfirm={async () => { try { await api('items.delete', { kind: item.kind, id: item.id, expectedVersion: data.version }); reload(); } catch (failure) { setMessage(failure.message); } }} /></div></div>)}</section>
    </>}
  </div>;
}
