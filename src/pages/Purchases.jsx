import AdminTabs from '../components/AdminTabs.jsx';
import { Fragment, useState } from 'react';
import { formatAmount } from '../../shared/commerce.js';
import { cleanImg } from '../../shared/portfolio.js';
import { Field, Loading, Notice, Stats } from '../components/Ui.jsx';
import { api } from '../lib/api.js';
import { useAdminTab } from '../lib/adminTabs.js';
import { useOp } from '../lib/hooks.js';
import { fmtStamp } from '../lib/when.js';

const STATUS = { paid: 'Paid', free: 'Free claim', pending: 'Pending payment', failed: 'Failed', refunded: 'Refunded' };

export function PurchaseDetails({ row, onSaved }) {
  const [note, setNote] = useState(row.note || ''), [fulfilled, setFulfilled] = useState(row.fulfillmentStatus === 'fulfilled');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const completed = ['paid', 'free'].includes(row.status);
  async function save() {
    setBusy(true); setError('');
    try { await api('purchases.fulfill', { id: row.id, fulfilled, note }); onSaved(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const entries = [
    ['Buyer', row.buyer.name], ['Email', <a key="email" href={`mailto:${row.buyer.email}`}>{row.buyer.email}</a>], ['Phone', row.buyer.phone],
    ['Receipt', row.id], ['Razorpay order', row.orderId], ['Payment', row.paymentId], ['Confirmed', row.paidAt && fmtStamp(row.paidAt)],
    ['Refunded', row.refundedAmount > 0 && formatAmount(row.refundedAmount, row.currency)],
  ];
  const link = completed && cleanImg(row.deliveryUrl);
  return <div className="card inner">
    <dl className="enq-dl">{entries.filter(([, v]) => v).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
    {link && <p><a href={link} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open buyer’s access / download link ↗</a></p>}
    <Field label="Private note"><textarea rows={2} maxLength={1000} value={note} disabled={!completed || busy} onChange={e => setNote(e.target.value)} /></Field>
    <div className="row"><label className="toggle"><input type="checkbox" checked={fulfilled} disabled={!completed || busy} onChange={e => setFulfilled(e.target.checked)} />Fulfilled</label>
      <button className="btn primary" disabled={!completed || busy} onClick={save}>{busy ? 'Saving…' : 'Save details'}</button></div>
    {!completed && <p className="hint">Fulfillment can be updated after a payment or free claim is confirmed.</p>}
    <Notice kind="error">{error}</Notice>
  </div>;
}

export function SharedPaymentSettings() {
  const { data, error, reload } = useOp('payments.settings');
  const [enabled, setEnabled] = useState(null), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  if (!data) return <Loading error={error} />;
  async function save() {
    setBusy(true); setMsg(null);
    try { await api('payments.saveSettings', { enabled: enabled ?? data.enabled }); setEnabled(null); reload(); setMsg({ kind: 'success', t: 'Payment preference saved.' }); }
    catch (e) { setMsg({ kind: 'error', t: e.message }); }
    finally { setBusy(false); }
  }
  return <section className="card">
    <h3>Shared Razorpay account</h3>
    <p className="muted">Paid purchases use the app’s Razorpay account. Every purchase is recorded under the profile that sold the item.</p>
    <Notice kind={data.configured ? 'success' : 'info'}>{data.configured ? `Payments are configured${data.testMode ? ' in test mode' : ''}.` : 'The platform administrator needs to configure Razorpay credentials and the payment encryption key.'}</Notice>
    {!data.webhookConfigured && <Notice kind="info">Set the shared Razorpay webhook secret to receive payment and refund updates.</Notice>}
    <label className="toggle"><input type="checkbox" checked={enabled ?? data.enabled} onChange={e => setEnabled(e.target.checked)} disabled={busy} />Enable paid checkout on my profile</label>
    <p className="hint">Free claims work without Razorpay. Add access or download links under Offerings → Offerings &amp; categories or Store products.</p>
    <button className="btn primary" disabled={busy || enabled === null} onClick={save}>{busy ? 'Saving…' : 'Save payment preference'}</button>
    <Notice kind={msg?.kind}>{msg?.t}</Notice>
  </section>;
}

function PurchaseList() {
  const [status, setStatus] = useState(''), [page, setPage] = useState(1), [open, setOpen] = useState(null);
  const { data, error, reload } = useOp('purchases.list', { status, page });
  if (!data) return <Loading error={error} />;
  const summary = data.summary || {};
  return <>
    <Stats items={[{ n: summary.total || 0, label: 'Purchases & claims' }, { n: summary.paid || 0, label: 'Paid purchases' }, { n: summary.free || 0, label: 'Free claims' }, { n: summary.pending || 0, label: 'Pending payment' }]} />
    {(summary.revenue || []).length > 0 && <p className="muted">Revenue after refunds: {summary.revenue.map(x => formatAmount(x.amount, x.currency)).join(' · ')}</p>}
    <div className="row" style={{ marginBottom: 16 }}>
      <select aria-label="Purchase status" value={status} onChange={e => { setStatus(e.target.value); setPage(1); setOpen(null); }}><option value="">All statuses</option>{Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <button className="btn small" onClick={reload}>Refresh</button>
    </div>
    <section className="card">
      {!data.rows.length && <p className="muted">{data.total ? 'No purchases on this page.' : 'No purchases here yet. Free claims and Razorpay payments from your profile appear here.'}</p>}
      {data.rows.map(row => <Fragment key={row.id}>
        <button className="enq-row" aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? null : row.id)}>
          <span className="enq-who"><b>{row.title}</b><small>{row.buyer.name}</small></span>
          <span className="enq-what"><b>{row.status === 'free' ? 'Free' : formatAmount(row.amount, row.currency)}</b><small>{row.fulfillmentStatus === 'fulfilled' ? 'Fulfilled' : 'Pending fulfillment'}</small></span>
          <span className="enq-when"><span className={`pill ${row.status === 'paid' || row.status === 'free' ? 'active' : 'draft'}`}>{STATUS[row.status]}</span><small>{fmtStamp(row.createdAt)}</small></span>
        </button>
        {open === row.id && <PurchaseDetails key={`${row.id}:${row.fulfillmentStatus}:${row.note}`} row={row} onSaved={reload} />}
      </Fragment>)}
    </section>
    <div className="row" style={{ marginTop: 16 }}><button className="btn" disabled={page <= 1} onClick={() => { setPage(p => p - 1); setOpen(null); }}>Previous</button>
      <span className="muted">Page {page} · {data.total} records</span><button className="btn" disabled={page * data.pageSize >= data.total} onClick={() => { setPage(p => p + 1); setOpen(null); }}>Next</button></div>
  </>;
}

export default function Purchases() {
  const [tab, setTab] = useAdminTab({ values: ['purchases', 'payments'], defaultValue: 'purchases', aliases: { settings: 'payments' } });
  return <>
    <div className="head"><div><h1>Purchases</h1><p className="muted" style={{ margin: 0 }}>Buyer details, payment receipts, free claims and fulfillment for your profile shop.</p></div></div>
    <AdminTabs label="Purchase tools" value={tab} onChange={setTab} items={[{ id: 'purchases', label: 'Receipts & fulfillment', icon: 'box' }, { id: 'payments', label: 'Payment settings', icon: 'shield' }]} />
    {tab === 'purchases' ? <PurchaseList /> : <SharedPaymentSettings />}
  </>;
}
