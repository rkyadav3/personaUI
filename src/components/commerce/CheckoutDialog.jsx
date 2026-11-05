import { useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { cleanImg } from '../../../shared/portfolio.js';
import { formatAmount, normalizeBuyer } from '../../../shared/commerce.js';
import { loadRazorpay, newReceipt, paymentRequest, readReceipt, recoverPurchase, saveReceipt } from '../../lib/publicActions.js';
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

export function PurchaseRecoveryForm({ details, errors = {}, working, onChange, onSubmit, onBack }) {
  const id = useId();
  return <form className="persona-form persona-recovery" onSubmit={onSubmit}>
    <h3>Recover your purchase</h3>
    <p className="persona-muted">Use the email you entered when buying and the payment ID from the original Razorpay receipt. The payment ID starts with pay_.</p>
    {['email', 'paymentId'].map(key => <label className="persona-field" key={key} htmlFor={`${id}-${key}`}>
      {key === 'email' ? 'Purchase email' : 'Razorpay payment ID'}
      <input id={`${id}-${key}`} type={key === 'email' ? 'email' : 'text'} autoComplete={key === 'email' ? 'email' : 'off'} maxLength={key === 'email' ? 160 : 84} required value={details[key]} disabled={working} placeholder={key === 'paymentId' ? 'pay_…' : 'Email used for the purchase'} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${id}-${key}-error` : undefined} onChange={event => onChange(key, event.target.value)} />
      {errors[key] && <small id={`${id}-${key}-error`} className="persona-error">{errors[key]}</small>}
    </label>)}
    <div className="persona-row"><button className="persona-button primary" type="submit" disabled={working}>{working ? 'Recovering purchase…' : 'Recover purchase'}</button><button className="persona-button" type="button" disabled={working} onClick={onBack}>Back to checkout</button></div>
  </form>;
}

export default function CheckoutDialog({ item, slug, owner, preview, onClose }) {
  const titleId = useId(), ref = item.checkout;
  const [receipt, setReceipt] = useState(() => readReceipt(slug, ref) || (preview ? null : newReceipt()));
  const saved = useRef(!preview && !!readReceipt(slug, ref));
  const [row, setRow] = useState(null), [buyer, setBuyer] = useState({ name: '', email: '', phone: '' });
  const [recoveryOpen, setRecoveryOpen] = useState(false), [recovery, setRecovery] = useState({ email: '', paymentId: '' });
  const [phase, setPhase] = useState(saved.current ? 'checking' : 'details'), [error, setError] = useState(''), [errors, setErrors] = useState({});
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const input = () => ({ slug, ...receipt });
  const working = ['creating', 'loading', 'paying', 'verifying', 'checking', 'recovering'].includes(phase);
  const ready = row && ['paid', 'free'].includes(row.status);
  const update = value => { if (!alive.current) return; setRow(value); setPhase('details'); setError(''); if (value.buyer) setBuyer(value.buyer); };
  const failed = e => { if (!alive.current) return; setError(e.message || 'Checkout failed. Please try again.'); setErrors(e.errors || {}); setPhase('details'); };
  const openRecovery = () => { setRecovery(value => ({ ...value, email: value.email || buyer.email })); setRecoveryOpen(true); setError(''); setErrors({}); };
  const missingReceipt = e => {
    if (!alive.current) return;
    if ([403, 404].includes(e.status)) {
      saved.current = false; setPhase('details');
      if (item.pricing === 'paid') openRecovery();
      else setError('No receipt is saved in this browser. You can claim this free item again, or recover a previous paid purchase.');
    } else failed(e);
  };

  useEffect(() => {
    if (!saved.current) return;
    paymentRequest('status', { slug, ...receipt }).then(update, missingReceipt);
  }, []); // The dialog is remounted for each item; one saved receipt is recovered on opening.

  async function check() {
    if (!saved.current && !row) { openRecovery(); return; }
    setPhase('checking'); setError('');
    try { update(await paymentRequest('status', input())); } catch (e) { missingReceipt(e); }
  }
  async function recover(event) {
    event.preventDefault(); if (working || preview) return;
    setPhase('recovering'); setError(''); setErrors({});
    try {
      const purchase = await recoverPurchase(slug, ref, recovery);
      if (!alive.current) return;
      setReceipt(purchase.receipt); saved.current = true; setRecoveryOpen(false); update(purchase);
    } catch (e) { failed(e); }
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
    saved.current = true;
    try {
      const purchase = await paymentRequest('create', { ...input(), item: ref, buyer: validation.value });
      update(purchase);
      if (purchase.razorpay && ['pending', 'failed'].includes(purchase.status)) await pay(purchase);
    } catch (e) { failed(e); }
  }
  function reset() { const next = newReceipt(); setReceipt(next); saveReceipt(slug, ref, next); saved.current = true; setRow(null); setError(''); setErrors({}); }

  return (
    <Dialog titleId={titleId} onClose={onClose} busy={working} suspended={phase === 'paying'}>
      <span className="persona-kicker">{preview ? 'Checkout preview' : 'Profile shop'}</span>
      <h2 id={titleId}>{item.title}</h2>
      {ready ? <PurchaseConfirmation row={row} /> : (
        <>
          {item.summary && <p className="persona-muted">{item.summary}</p>}
          <strong className="persona-price">{row ? formatAmount(row.amount, row.currency) : item.price}</strong>
          {preview && <p className="persona-notice">Visitors fill in their details here. Free items open immediately; paid items use Razorpay.</p>}
          {recoveryOpen ? <PurchaseRecoveryForm details={recovery} errors={errors} working={working} onSubmit={recover} onChange={(key, value) => setRecovery(previous => ({ ...previous, [key]: value }))} onBack={() => { setRecoveryOpen(false); setError(''); setErrors({}); }} /> : row?.status === 'refunded' ? <p className="persona-notice">This purchase has been refunded. Refunded: {formatAmount(row.refundedAmount, row.currency)}.</p> : (
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
          {!preview && !recoveryOpen && <div className="persona-recovery-entry"><span>Already purchased?</span><button type="button" className="persona-button" disabled={working} onClick={openRecovery}>Recover receipt</button></div>}
          {error && <p className="persona-notice error" role="alert">{error}</p>}
          {phase === 'paying' && <p role="status" className="persona-muted">Complete the payment in Razorpay.</p>}
        </>
      )}
    </Dialog>
  );
}
