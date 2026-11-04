import { useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { cleanImg } from '../../../shared/portfolio.js';
import { formatAmount, normalizeBuyer } from '../../../shared/commerce.js';
import { loadRazorpay, newReceipt, paymentRequest, readReceipt, saveReceipt } from '../../lib/publicActions.js';
import Dialog from './Dialog.jsx';
import '../../styles/profileActions.css';

export function PurchaseConfirmation({ row }) {
  const link = ['paid', 'free'].includes(row.status) ? cleanImg(row.deliveryUrl) : '';
  return (
    <div className="persona-confirm" role="status">
      <span className="persona-success-icon" aria-hidden="true">✓</span>
      <h3>{row.status === 'free' ? 'Your free item is ready' : 'Purchase confirmed'}</h3>
      <p>{row.title}</p>
      <dl className="persona-receipt">
        <div><dt>Total</dt><dd>{row.status === 'free' ? 'Free' : formatAmount(row.amount, row.currency)}</dd></div>
        <div><dt>Receipt</dt><dd>{row.id}</dd></div>
        {row.paymentId && <div><dt>Payment</dt><dd>{row.paymentId}</dd></div>}
        <div><dt>Buyer</dt><dd>{row.buyer?.name} · {row.buyer?.email}</dd></div>
      </dl>
      {link && <a className="persona-button primary" href={link} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open access / download ↗</a>}
      <p className="persona-muted">Bookmark the access link. You can reopen this receipt from the item in this browser.</p>
    </div>
  );
}

export default function CheckoutDialog({ item, slug, owner, preview, onClose }) {
  const titleId = useId(), ref = item.checkout;
  const [receipt, setReceipt] = useState(() => readReceipt(slug, ref) || (preview ? null : newReceipt()));
  const saved = useRef(!preview && !!readReceipt(slug, ref));
  const [row, setRow] = useState(null), [buyer, setBuyer] = useState({ name: '', email: '', phone: '' });
  const [phase, setPhase] = useState(saved.current ? 'checking' : 'details'), [error, setError] = useState(''), [errors, setErrors] = useState({});
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const input = () => ({ slug, ...receipt });
  const working = ['creating', 'loading', 'paying', 'verifying', 'checking'].includes(phase);
  const ready = row && ['paid', 'free'].includes(row.status);
  const update = value => { if (!alive.current) return; setRow(value); setPhase('details'); setError(''); if (value.buyer) setBuyer(value.buyer); };
  const failed = e => { if (!alive.current) return; setError(e.message || 'Checkout failed. Please try again.'); setErrors(e.errors || {}); setPhase('details'); };

  useEffect(() => {
    if (!saved.current) return;
    paymentRequest('status', { slug, ...receipt }).then(update, e => {
      if (e.status === 404) { if (alive.current) setPhase('details'); } else failed(e);
    });
  }, []); // The dialog is remounted for each item; one saved receipt is recovered on opening.

  async function check() {
    setPhase('checking'); setError('');
    try { update(await paymentRequest('status', input())); } catch (e) { failed(e); }
  }
  async function pay(purchase) {
    setPhase('loading');
    try {
      const Razorpay = await loadRazorpay();
      let settled = false;
      const checkout = new Razorpay({
        key: purchase.razorpay.keyId, order_id: purchase.razorpay.orderId, amount: purchase.amount, currency: purchase.currency,
        name: owner || 'Persona', description: purchase.title, prefill: { name: purchase.buyer.name, email: purchase.buyer.email, contact: purchase.buyer.phone },
        handler: async result => {
          settled = true; if (!alive.current) return; setPhase('verifying');
          try { update(await paymentRequest('verify', { ...input(), ...result })); }
          catch (e) { failed(e); }
        },
        modal: { ondismiss: () => { if (!settled && alive.current) { setPhase('details'); setError('Payment was closed. You can continue payment or check this receipt.'); } } },
      });
      checkout.on('payment.failed', result => {
        settled = true; checkout.close();
        if (alive.current) { setPhase('details'); setError(result?.error?.description || 'Payment was unsuccessful. You can try again.'); }
      });
      // Native modal dialogs make the rest of the document inert, including Razorpay's hosted frame.
      flushSync(() => setPhase('paying'));
      checkout.open();
    } catch (e) { failed(e); }
  }
  async function submit(e) {
    e.preventDefault(); if (working || preview) return;
    const validation = normalizeBuyer(buyer);
    if (!validation.ok) { setErrors(validation.errors); setError('Check your contact details.'); return; }
    setErrors({}); setError(''); setPhase('creating');
    saveReceipt(slug, ref, receipt);
    try {
      const purchase = await paymentRequest('create', { ...input(), item: ref, buyer: validation.value });
      update(purchase);
      if (purchase.razorpay && ['pending', 'failed'].includes(purchase.status)) await pay(purchase);
    } catch (e) { failed(e); }
  }
  function reset() { const next = newReceipt(); setReceipt(next); saveReceipt(slug, ref, next); setRow(null); setError(''); setErrors({}); }

  return (
    <Dialog titleId={titleId} onClose={onClose} busy={working} suspended={phase === 'paying'}>
      <span className="persona-kicker">{preview ? 'Checkout preview' : 'Profile shop'}</span>
      <h2 id={titleId}>{item.title}</h2>
      {ready ? <PurchaseConfirmation row={row} /> : (
        <>
          {item.summary && <p className="persona-muted">{item.summary}</p>}
          <strong className="persona-price">{row ? formatAmount(row.amount, row.currency) : item.price}</strong>
          {preview && <p className="persona-notice">Visitors fill in their details here. Free items open immediately; paid items use Razorpay.</p>}
          {row?.status === 'refunded' ? <p className="persona-notice">This purchase has been refunded. Refunded: {formatAmount(row.refundedAmount, row.currency)}.</p> : (
            <form onSubmit={submit} className="persona-form">
              {['name', 'email', 'phone'].map(key => (
                <label key={key} className="persona-field" htmlFor={`${titleId}-${key}`}>
                  {key === 'name' ? 'Full name *' : key === 'email' ? 'Email *' : 'Phone (optional)'}
                  <input id={`${titleId}-${key}`} type={key === 'name' ? 'text' : key === 'email' ? 'email' : 'tel'} autoComplete={key === 'phone' ? 'tel' : key}
                    maxLength={key === 'name' ? 100 : key === 'email' ? 160 : 40} value={buyer[key]} required={key !== 'phone'} disabled={working || !!row}
                    aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${titleId}-${key}-error` : undefined} onChange={e => setBuyer(b => ({ ...b, [key]: e.target.value }))} />
                  {errors[key] && <small id={`${titleId}-${key}-error`} className="persona-error">{errors[key]}</small>}
                </label>
              ))}
              <div className="persona-row">
                {row?.razorpay ? <button type="button" className="persona-button primary" disabled={working} onClick={() => pay(row)}>Continue payment</button>
                  : row?.status === 'failed' ? <button type="button" className="persona-button primary" disabled={working} onClick={reset}>Start a new checkout</button>
                    : <button className="persona-button primary" disabled={working || preview}>{working ? phase === 'verifying' ? 'Verifying payment…' : phase === 'checking' ? 'Checking receipt…' : 'Please wait…' : item.pricing === 'free' ? 'Get free item' : 'Pay with Razorpay'}</button>}
                {!preview && <button type="button" className="persona-button" disabled={working} onClick={check}>Check receipt</button>}
              </div>
              {row?.status === 'pending' && !row.razorpay && <p className="persona-muted">Your payment order is being prepared. Check the receipt in a moment.</p>}
            </form>
          )}
          {error && <p className="persona-notice error" role="alert">{error}</p>}
          {phase === 'paying' && <p role="status" className="persona-muted">Complete the payment in Razorpay.</p>}
        </>
      )}
    </Dialog>
  );
}
