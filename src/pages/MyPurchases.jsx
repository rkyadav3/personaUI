import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { publicRequest } from '../lib/publicActions.js';
import { PurchaseConfirmation } from '../components/commerce/CheckoutDialog.jsx';
import '../styles/profileActions.css';

export default function MyPurchases() {
  const { slug } = useParams();
  return <PurchaseAccess key={slug} slug={slug} />;
}
function PurchaseAccess({ slug }) {
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [contact, setContact] = useState(''), [code, setCode] = useState(''), [sent, setSent] = useState(false), [accessToken, setAccessToken] = useState(''), [data, setData] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const request = (op, input = {}) => publicRequest('/api/my-purchases', { slug, contact, op, ...input });
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      if (!sent) { await request('request'); if (alive.current) setSent(true); }
      else { const proof = await request('verify', { code }); if (!alive.current) return; setAccessToken(proof.accessToken); const result = await request('list', { accessToken: proof.accessToken }); if (alive.current) setData(result); }
    } catch (failure) { if (alive.current) setError(failure.message); }
    finally { if (alive.current) setBusy(false); }
  }
  async function next(page) {
    setBusy(true); setError('');
    try { const result = await request('list', { accessToken, page }); if (alive.current) setData(result); }
    catch (failure) { if (alive.current) setError(failure.message); }
    finally { if (alive.current) setBusy(false); }
  }
  return <main className="buyer-purchases"><Link to={`/p/${slug}/store`}>Back to Store</Link><h1>My purchases</h1><p>Verify the email or phone you used at checkout to view purchases from this profile.</p>
    {!data ? <form className="persona-form" onSubmit={submit}><label className="persona-field">Purchase email or phone<input required maxLength={160} autoComplete="email" value={contact} disabled={busy || sent} placeholder="Email or +91…" onChange={event => setContact(event.target.value)} /></label>{sent && <label className="persona-field">Verification code<input required autoComplete="one-time-code" inputMode="numeric" maxLength={8} value={code} disabled={busy} onChange={event => setCode(event.target.value)} /></label>}<div className="persona-row"><button type="submit" className="persona-button primary" disabled={busy}>{busy ? 'Please wait…' : sent ? 'View my purchases' : 'Send verification code'}</button>{sent && <button type="button" className="persona-button" disabled={busy} onClick={() => { setSent(false); setCode(''); }}>Use another contact / resend</button>}</div></form> : <>
      <div className="persona-row"><p>{data.total} purchases for {contact}</p><button type="button" className="persona-button" disabled={busy} onClick={() => { setData(null); setAccessToken(''); setSent(false); setCode(''); }}>Sign out of purchases</button></div>
      {!data.rows.length && <p>No completed purchases were found for these verified contact details.</p>}
      {data.rows.map(row => <section className="buyer-purchase" key={row.id}>{row.status === 'refunded' ? <><h2>{row.title}</h2><p>This purchase was refunded.</p></> : <PurchaseConfirmation row={row} slug={slug} receipt={row.receipt} />}</section>)}
      {data.total > 50 && <div className="persona-row"><button className="persona-button" disabled={busy || data.page <= 1} onClick={() => next(data.page - 1)}>Previous</button><span>Page {data.page}</span><button className="persona-button" disabled={busy || data.page * 50 >= data.total} onClick={() => next(data.page + 1)}>Next</button></div>}
    </>}{error && <p className="persona-notice error" role="alert">{error}</p>}
  </main>;
}
