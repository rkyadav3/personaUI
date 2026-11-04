import { useEffect, useId, useState } from 'react';
import { normalizeEventForm, splitSchedule } from '../../../shared/engage.js';
import { normalizeRsvp } from '../../../shared/rsvp.js';
import { publicRequest } from '../../lib/publicActions.js';
import { EventRow } from './Updates.jsx';
import '../../styles/profileActions.css';

const tokenKey = (slug, id) => `persona-rsvp:${slug}:${id}`;
const readToken = (slug, id) => { try { return localStorage.getItem(tokenKey(slug, id)) || ''; } catch { return ''; } };

export function RsvpForm({ event, slug, owner, preview, onSaved }) {
  const cfg = normalizeEventForm(event.rsvp), id = useId();
  const [value, setValue] = useState({ name: '', email: '', phone: '', response: 'going', publicName: false, note: '', answers: {}, website: '' });
  const [errors, setErrors] = useState({}), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const set = (key, next) => setValue(v => ({ ...v, [key]: next }));
  const field = (key, label, options = {}) => (
    <label className="persona-field" htmlFor={`${id}-${key}`}>
      {label}<input id={`${id}-${key}`} value={value[key]} onChange={e => set(key, e.target.value)} disabled={busy}
        aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${id}-${key}-error` : undefined} {...options} />
      {errors[key] && <small className="persona-error" id={`${id}-${key}-error`}>{errors[key]}</small>}
    </label>
  );
  async function submit(e) {
    e.preventDefault(); if (busy || preview) return;
    const validation = normalizeRsvp(value, cfg);
    if (!validation.ok) { setErrors(validation.errors); setError('Please check the form.'); return; }
    setBusy(true); setError(''); setErrors({});
    try {
      const result = await publicRequest('/api/rsvp', { ...value, slug, eventId: event.id, editToken: readToken(slug, event.id) });
      if (result.editToken) { try { localStorage.setItem(tokenKey(slug, event.id), result.editToken); } catch { /* The current response is still saved. */ } }
      onSaved(result.response || value.response);
    } catch (e) { setError(e.message); setErrors(e.errors || {}); }
    finally { setBusy(false); }
  }
  return (
    <form className="persona-form persona-event-form" onSubmit={submit}>
      <fieldset className="persona-choice" disabled={busy}><legend>Are you coming?</legend><div>
        {[['going', 'Going'], ['not_going', 'Not going']].map(([key, label]) => <label key={key}><input type="radio" name={`${id}-response`} value={key} checked={value.response === key} onChange={() => set('response', key)} />{label}</label>)}
      </div></fieldset>
      {field('name', 'Full name *', { type: 'text', autoComplete: 'name', required: true, maxLength: 100 })}
      {field('email', 'Email *', { type: 'email', autoComplete: 'email', required: true, maxLength: 160 })}
      {field('phone', cfg.requirePhone ? 'Phone *' : 'Phone (optional)', { type: 'tel', autoComplete: 'tel', required: cfg.requirePhone, maxLength: 40 })}
      {cfg.questions.map(q => <label className="persona-field" key={q.id} htmlFor={`${id}-${q.id}`}>
        {q.label}{q.required ? ' *' : ''}<input id={`${id}-${q.id}`} required={q.required} maxLength={500} value={value.answers[q.id] || ''} disabled={busy}
          aria-invalid={!!errors[q.id]} aria-describedby={errors[q.id] ? `${id}-${q.id}-error` : undefined} onChange={e => set('answers', { ...value.answers, [q.id]: e.target.value })} />
        {errors[q.id] && <small className="persona-error" id={`${id}-${q.id}-error`}>{errors[q.id]}</small>}
      </label>)}
      <label className="persona-field" htmlFor={`${id}-note`}>Note (optional)<textarea id={`${id}-note`} rows={2} maxLength={500} value={value.note} disabled={busy} onChange={e => set('note', e.target.value)} /></label>
      {cfg.showAttendees && <label className="persona-check"><input type="checkbox" checked={value.publicName} onChange={e => set('publicName', e.target.checked)} disabled={busy} />Show my name in the public attendance list</label>}
      <label className="persona-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={value.website} onChange={e => set('website', e.target.value)} /></label>
      <p className="persona-muted">Your contact details and answers are visible to {owner || 'the profile owner'}.</p>
      {preview && <p className="persona-notice">Form preview. Responses can be sent from your public profile.</p>}
      {error && <p className="persona-notice error" role="alert">{error}</p>}
      <button className="persona-button primary" disabled={busy || preview}>{busy ? 'Saving response…' : 'Save response'}</button>
    </form>
  );
}

export function AttendanceCard({ event, slug, owner, preview, now, past = false }) {
  const cfg = normalizeEventForm(event.rsvp);
  const [summary, setSummary] = useState(preview ? { going: 0, notGoing: 0, goingNames: [], notGoingNames: [], accepting: cfg.enabled && !past } : null);
  const [error, setError] = useState(''), [open, setOpen] = useState(false), [saved, setSaved] = useState('');
  const url = `/api/rsvp?slug=${encodeURIComponent(slug)}&eventId=${encodeURIComponent(event.id)}`;
  async function refresh() {
    try { setSummary(await publicRequest(url)); setError(''); } catch (e) { setError(e.message); }
  }
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    publicRequest(url, undefined, { signal: controller.signal }).then(s => { setSummary(s); setError(''); }, e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [url, preview]);
  const accepting = !past && cfg.enabled && summary?.accepting !== false;
  return (
    <EventRow x={event} now={now} past={past}>
      <div className="persona-attendance">
        {summary ? <>
          <div className="persona-attendance-counts"><span><b>{summary.going}</b>Going</span><span><b>{summary.notGoing}</b>Not going</span></div>
          {cfg.showAttendees && <details className="persona-attendance-names"><summary>See who’s coming</summary>
            <div><strong>Going:</strong> {summary.goingNames.length ? summary.goingNames.join(', ') : 'No public names yet'}</div>
            <div><strong>Not going:</strong> {summary.notGoingNames.length ? summary.notGoingNames.join(', ') : 'No public names yet'}</div>
          </details>}
        </> : !error && <span className="persona-muted" role="status">Loading attendance…</span>}
        {error && <div role="alert" className="persona-row"><span className="persona-error">Attendance could not be loaded.</span><button type="button" className="persona-button" onClick={refresh}>Retry</button></div>}
        {saved && <p className="persona-notice success" role="status">Response saved — {saved === 'going' ? 'Going' : 'Not going'}.</p>}
        {accepting ? <>
          <button type="button" className="persona-button" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? 'Close form' : saved ? 'Change response' : 'Respond to event'}</button>
          {open && <RsvpForm event={event} slug={slug} owner={owner} preview={preview} onSaved={response => { setSaved(response); setOpen(false); refresh(); }} />}
        </> : <p className="persona-muted">Responses are closed for this event.</p>}
      </div>
    </EventRow>
  );
}

export default function Events({ events, slug, owner, preview = false }) {
  const now = Date.now(), { upcoming, past } = splitSchedule(events, now);
  const card = event => <AttendanceCard key={event.id} event={event} slug={slug} owner={owner} preview={preview} now={now} past={past.includes(event)} />;
  if (!events.length) return null;
  return (
    <div className="persona-events">
      {upcoming.map(card)}
      {past.length > 0 && <details className="persona-past" open={!upcoming.length}><summary>Past events ({past.length})</summary><div className="persona-events">{past.map(card)}</div></details>}
    </div>
  );
}
