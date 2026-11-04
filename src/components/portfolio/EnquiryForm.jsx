// The full enquiry form on /p/<slug>/contact. What is sent lands in that member's admin inbox (Admin → Enquiries).
// The same rules (shared/engage.js) run here for instant messages and again on the server before anything is stored.
import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CONTACT_METHODS, ENQUIRY_TYPES, MEETING_MODES, SCHEDULING_TYPES, TIME_SLOTS } from '../../../shared/enquiryTypes.js';
import { normalizeEnquiry } from '../../../shared/engage.js';
import Icon from './Icon.jsx';

const blank = { name: '', email: '', phone: '', organisation: '', location: '', kind: '', offeringId: '', subject: '', message: '', prefDate: '', prefTime: '', prefContact: '', meetingMode: '', budget: '', consent: false, website: '' };

function Row({ label, hint, error, id, required, children }) {
  return (
    <div className={`pf-field${error ? ' bad' : ''}`}>
      <label htmlFor={id}>{label}{required && <i aria-hidden="true"> *</i>}</label>
      {children}
      {hint && !error && <small>{hint}</small>}
      {error && <small className="pf-err" role="alert">{error}</small>}
    </div>
  );
}

export default function EnquiryForm({ slug, cfg, offers = [], owner, preview = false }) {
  const q = new URLSearchParams(useLocation().search);
  const types = useMemo(() => (cfg.types?.length ? cfg.types : Object.keys(ENQUIRY_TYPES)), [cfg.types]);
  const fromOffer = preview ? null : offers.find(o => String(o.id) === q.get('offering'));   // "Enquire" on a product card pre-fills this
  const [f, setF] = useState({ ...blank, kind: fromOffer && types.includes('offering') ? 'offering' : types.length === 1 ? types[0] : '', offeringId: fromOffer ? String(fromOffer.id) : '', subject: fromOffer ? `About: ${fromOffer.title}` : '' });
  const [errors, setErrors] = useState({}), [busy, setBusy] = useState(false), [serverErr, setServerErr] = useState(''), [done, setDone] = useState(false);
  const set = (k, v) => { setF(p => ({ ...p, [k]: v })); if (errors[k]) setErrors(e => ({ ...e, [k]: undefined })); };
  const scheduling = SCHEDULING_TYPES.includes(f.kind);
  const today = new Date().toISOString().slice(0, 10);
  const input = (k, extra = {}) => ({ id: `enq-${k}`, value: f[k], onChange: e => set(k, e.target.value), disabled: preview, 'aria-invalid': errors[k] ? true : undefined, ...extra });

  async function submit(e) {
    e.preventDefault();
    if (preview || busy) return;
    const r = normalizeEnquiry(f, { types });
    if (!r.ok) {
      setErrors(r.errors); setServerErr('');
      const first = Object.keys(r.errors)[0];
      document.getElementById(`enq-${first}`)?.focus();
      return;
    }
    setBusy(true); setErrors({}); setServerErr('');
    try {
      const res = await fetch('/api/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, slug }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.ok === false) { setServerErr(d.error || 'Could not send your enquiry. Please try again.'); if (d.errors) setErrors(d.errors); }
      else { setDone(true); window.scrollTo?.({ top: 0, behavior: 'smooth' }); }
    } catch { setServerErr('Could not reach the server. Check your connection and try again.'); }
    setBusy(false);
  }

  if (done) {
    return (
      <div className="pf-card pf-form pf-ok" role="status">
        <span className="pf-icon-box"><Icon n="email" size={22} /></span>
        <h3>Thank you, your enquiry is on its way</h3>
        <p>{cfg.thanks || `${owner || 'The team'} has received it and will reply using the details you gave.`}</p>
        <button type="button" className="pf-btn sm" onClick={() => { setF({ ...blank }); setDone(false); }}>Send another enquiry</button>
      </div>
    );
  }

  return (
    <form className="pf-card pf-form" onSubmit={submit} noValidate>
      {preview && <p className="pf-note">Preview only: visitors can fill this in, but it cannot be sent from here.</p>}

      <fieldset className="pf-fs">
        <legend>About you</legend>
        <div className="pf-fgrid">
          <Row label="Full name" id="enq-name" required error={errors.name}><input type="text" autoComplete="name" maxLength={100} {...input('name')} /></Row>
          <Row label="Email" id="enq-email" required error={errors.email}><input type="email" autoComplete="email" maxLength={160} {...input('email')} /></Row>
          <Row label="Phone or WhatsApp" id="enq-phone" error={errors.phone} hint="Optional, with country code"><input type="tel" autoComplete="tel" maxLength={40} {...input('phone')} /></Row>
          <Row label="Organisation or company" id="enq-organisation" error={errors.organisation}><input type="text" autoComplete="organization" maxLength={120} {...input('organisation')} /></Row>
          <Row label="City and country" id="enq-location" error={errors.location}><input type="text" maxLength={120} {...input('location')} /></Row>
        </div>
      </fieldset>

      <fieldset className="pf-fs">
        <legend>Your enquiry</legend>
        <div className="pf-fgrid">
          <Row label="What is this about?" id="enq-kind" required error={errors.kind}>
            <select {...input('kind')}><option value="">Choose one…</option>{types.map(t => <option key={t} value={t}>{ENQUIRY_TYPES[t]}</option>)}</select>
          </Row>
          {offers.length > 0 && (
            <Row label="Related offering" id="enq-offeringId" hint="Optional">
              <select {...input('offeringId')}><option value="">Not about a specific one</option>{offers.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}</select>
            </Row>
          )}
        </div>
        <Row label="Subject" id="enq-subject" required error={errors.subject}><input type="text" maxLength={120} {...input('subject')} /></Row>
        <Row label="Your message" id="enq-message" required error={errors.message} hint={`${f.message.length}/2000`}><textarea rows={6} maxLength={2000} {...input('message')} /></Row>
      </fieldset>

      {scheduling && (
        <fieldset className="pf-fs">
          <legend>Timing and budget</legend>
          <div className="pf-fgrid">
            <Row label="Preferred date" id="enq-prefDate" error={errors.prefDate}><input type="date" min={today} {...input('prefDate')} /></Row>
            <Row label="Preferred time" id="enq-prefTime"><select {...input('prefTime')}><option value="">No preference</option>{TIME_SLOTS.map(t => <option key={t}>{t}</option>)}</select></Row>
            <Row label="Meeting mode" id="enq-meetingMode"><select {...input('meetingMode')}><option value="">Not sure yet</option>{MEETING_MODES.map(t => <option key={t}>{t}</option>)}</select></Row>
            <Row label="Budget or fee range" id="enq-budget" hint="Optional"><input type="text" maxLength={60} placeholder="e.g. ₹5,000 to ₹10,000" {...input('budget')} /></Row>
          </div>
        </fieldset>
      )}

      <fieldset className="pf-fs">
        <legend>How should we reply?</legend>
        <Row label="Preferred way to reach you" id="enq-prefContact" error={errors.prefContact}>
          <select {...input('prefContact')}><option value="">Email is fine</option>{CONTACT_METHODS.map(t => <option key={t}>{t}</option>)}</select>
        </Row>
        <div className="pf-hp" aria-hidden="true"><label>Leave this empty<input type="text" tabIndex={-1} autoComplete="off" value={f.website} onChange={e => set('website', e.target.value)} /></label></div>
        <label className={`pf-check${errors.consent ? ' bad' : ''}`}>
          <input id="enq-consent" type="checkbox" checked={f.consent} disabled={preview} onChange={e => set('consent', e.target.checked)} />
          <span>I agree that {owner || 'the profile owner'} may contact me using the details above about this enquiry.</span>
        </label>
        {errors.consent && <small className="pf-err" role="alert">{errors.consent}</small>}
      </fieldset>

      {serverErr && <p className="pf-banner" role="alert">{serverErr}</p>}
      <button className="pf-btn dark" disabled={busy || preview}>{busy ? 'Sending…' : 'Send enquiry'} <Icon n="arrow" size={16} /></button>
    </form>
  );
}
