import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { useOp } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';
import { Field, Loading, Notice, Stats } from '../components/Ui.jsx';
import '../styles/governance.css';

// The checkout ledger records amounts in minor currency units.
export function saleMoney(amount, currency) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(amount || 0) / 100);
}
export function RevenueTotals({ currencies = [] }) {
  return <div className="governance-revenue">{currencies.map(row => <article className="card" key={row.currency}><h3>{row.currency}</h3><dl><div><dt>Gross sales</dt><dd>{saleMoney(row.gross, row.currency)}</dd></div><div><dt>Refunds</dt><dd>{saleMoney(row.refunds, row.currency)}</dd></div><div><dt>Net earnings</dt><dd><strong>{saleMoney(row.net, row.currency)}</strong></dd></div></dl><small className="muted">{row.paidSales} paid sales</small></article>)}</div>;
}
export default function PlatformPayments() {
  const { user } = useAuth();
  return user?.isSuperAdmin ? <PlatformSales /> : <Notice kind="error">Only the SuperAdmin can manage platform payments.</Notice>;
}
function PlatformSales() {
  const { data, error, reload } = useOp('platform.sales');
  return data ? <SalesManager report={data} reload={reload} /> : <Loading error={error} label="Loading platform sales…" />;
}
export function SalesManager({ report, reload }) {
  const [seller, setSeller] = useState('all'), [busy, setBusy] = useState(false), [notice, setNotice] = useState(null);
  const admins = report.admins || [], products = (report.products || []).filter(row => seller === 'all' || row.ownerId === seller), recent = (report.recent || []).filter(row => seller === 'all' || row.ownerId === seller);
  async function checkout(admin) {
    setBusy(true); setNotice(null);
    try { await api('platform.payments.setEnabled', { id: admin.id, enabled: !admin.checkoutEnabled }); await reload(); setNotice({ kind: 'success', text: `${admin.name}’s checkout ${admin.checkoutEnabled ? 'paused' : 'enabled'}.` }); }
    catch (error) { setNotice({ kind: 'error', text: error.message }); }
    finally { setBusy(false); }
  }
  return <>
    <div className="head"><div><span className="governance-eyebrow">PLATFORM FINANCES</span><h1>Sales & payments</h1><p className="muted">Track every admin’s sales and support their checkout.</p></div><button className="btn" disabled={busy} onClick={reload}>Refresh</button></div>
    <Stats items={[{ n: report.counts.paidSales, label: 'Paid sales', sub: 'Includes subsequently refunded sales' }, { n: report.counts.freeOrders, label: 'Free orders' }, { n: report.counts.pending, label: 'Pending payments' }, { n: report.counts.refundedOrders, label: 'Fully refunded orders', sub: `${report.counts.failed} failed payments` }]} />
    <p className="muted">Totals are shown separately for each currency. Net earnings are sales minus refunds, before gateway fees or payouts. Pending and failed payments do not contribute to earnings.</p>
    <RevenueTotals currencies={report.currencies} />{!report.currencies?.length && <Notice>No paid sales yet.</Notice>}
    {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
    <section className="card governance-card"><h2>Admin earnings & checkout</h2><div className="governance-table"><table className="data"><thead><tr><th>Admin</th><th>Paid sales</th><th>Free orders</th><th>Earnings by currency</th><th>Checkout</th></tr></thead><tbody>{admins.map(admin => <tr key={admin.id}><td><strong>{admin.name}</strong><small className="governance-detail">{admin.email}</small>{!admin.accountExists && <small className="governance-detail">Account deleted · historical sales retained</small>}</td><td>{admin.paidSales}</td><td>{admin.freeOrders}</td><td>{admin.earnings.length ? admin.earnings.map(row => <div key={row.currency}><strong>{row.currency} {saleMoney(row.net, row.currency)}</strong><small className="governance-detail">Gross {saleMoney(row.gross, row.currency)} · Refunds {saleMoney(row.refunds, row.currency)}</small></div>) : <span className="muted">No paid sales</span>}</td><td>{admin.accountExists ? <><span className="governance-detail">{admin.checkoutEnabled ? 'Enabled' : 'Paused'}</span><button className="btn small" aria-label={`${admin.checkoutEnabled ? 'Pause' : 'Enable'} checkout for ${admin.name}`} disabled={busy} onClick={() => checkout(admin)}>{admin.checkoutEnabled ? 'Pause checkout' : 'Enable checkout'}</button></> : '—'}</td></tr>)}{!admins.length && <tr><td colSpan={5}>No admin accounts yet.</td></tr>}</tbody></table></div></section>
    <Field label="Filter product sales and recent payments by admin"><select value={seller} onChange={event => setSeller(event.target.value)}><option value="all">All admins</option>{admins.map(admin => <option key={admin.id} value={admin.id}>{admin.name} · {admin.email}</option>)}</select></Field>
    <section className="card governance-card"><h2>Product sales</h2><div className="governance-table"><table className="data"><thead><tr><th>Product / offering</th><th>Admin</th><th>Paid sales</th><th>Free orders</th><th>Gross sales</th><th>Refunds</th><th>Net earnings</th></tr></thead><tbody>{products.map(row => <tr key={`${row.ownerId}:${row.kind}:${row.itemId}:${row.currency}`}><td><strong>{row.title}</strong><small className="governance-detail">{row.kind} · {row.currency}</small></td><td>{row.adminName}</td><td>{row.paidSales}</td><td>{row.freeOrders}</td><td>{saleMoney(row.gross, row.currency)}</td><td>{saleMoney(row.refunds, row.currency)}</td><td>{saleMoney(row.net, row.currency)}</td></tr>)}{!products.length && <tr><td colSpan={7}>No completed orders for this selection.</td></tr>}</tbody></table></div></section>
    <section className="card governance-card"><h2>Recent payments</h2><p className="muted">Latest 50 platform orders. Use the payment reference when helping an admin with their payment provider.</p><div className="governance-table"><table className="data"><thead><tr><th>Product / admin</th><th>Buyer</th><th>Amount</th><th>Status</th><th>Payment reference</th><th>Date</th></tr></thead><tbody>{recent.map(row => <tr key={row.id}><td><strong>{row.title}</strong><small className="governance-detail">{row.adminName}</small></td><td>{row.buyerName || '—'}</td><td>{row.currency} {saleMoney(row.amount, row.currency)}{row.refundedAmount > 0 && <small className="governance-detail">Refunded {saleMoney(row.refundedAmount, row.currency)}</small>}</td><td><span className="governance-tag">{row.status}</span></td><td><code>{row.paymentId || '—'}</code><small className="governance-detail">Order {row.id}</small></td><td>{fmtDate(row.paidAt || row.createdAt)}</td></tr>)}{!recent.length && <tr><td colSpan={6}>No recent payments for this selection.</td></tr>}</tbody></table></div></section>
  </>;
}
