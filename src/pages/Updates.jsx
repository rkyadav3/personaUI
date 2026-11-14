import AdminTabs from '../components/AdminTabs.jsx';
// Admin → Updates & Schedule. Whatever is published here appears on the member's public profile (/p/<slug>/updates and the
// "What's new" block on their home page). Drafts stay private.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useAdminTab } from '../lib/adminTabs.js';
import { useAuth } from '../lib/auth.jsx';
import { useOp } from '../lib/hooks.js';
import { fmtStamp, fromLocalInput, toLocalInput } from '../lib/when.js';
import { normalizeEventForm, splitSchedule } from '../../shared/engage.js';
import { Confirm, Field, Loading, Notice } from '../components/Ui.jsx';
import MediaUpload, { UploadGroup } from '../components/MediaUpload.jsx';
import FormDialog from '../components/FormDialog.jsx';

const blank = kind => ({ kind, title: '', body: '', startsAt: '', endsAt: '', location: '', url: '', linkLabel: '', status: 'published', pinned: false });
const COPY = {
  update: { tab: 'Updates', add: 'New update', empty: 'No updates yet. Post news, launches or announcements and they appear on your profile.', hint: 'News, launches and announcements. Add a date in the future and it shows as Upcoming.' },
  schedule: { tab: 'Schedule', add: 'New schedule item', empty: 'Nothing scheduled. Add sessions, talks, office hours or events with a date and time.', hint: 'Dated sessions, talks and events. Visitors see them soonest first, with an add-to-calendar link.' },
  event: { tab: 'Events', add: 'Add Event', empty: 'No events yet. Add an event and let visitors tell you whether they are coming.', hint: 'Events appear on your profile home page with a Going / Not going response form and attendance counts.' },
};

export function UpdateEditor({ item, onDone, onBusy, dialog = false }) {
  const [f, setF] = useState({ ...blank(item.kind), ...item, rsvp: normalizeEventForm(item.rsvp), startsAt: toLocalInput(item.startsAt), endsAt: toLocalInput(item.endsAt) });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false);
  useEffect(() => { onBusy?.(busy || uploading); }, [busy, uploading, onBusy]);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const sched = f.kind !== 'update', event = f.kind === 'event';
  const form = patch => set('rsvp', { ...f.rsvp, ...patch });

  async function submit(e) {
    e.preventDefault(); if (busy || uploading) return; setErr(''); setBusy(true);
    try { await api('updates.save', { ...f, startsAt: fromLocalInput(f.startsAt), endsAt: fromLocalInput(f.endsAt) }); onDone(true); }
    catch (ex) { setErr(ex.message); setBusy(false); }
  }
  return (
    <form className={dialog ? 'admin-create-form' : 'card inner'} onSubmit={submit}>
      <fieldset className="editor-fieldset" disabled={busy || uploading}>
      <Field label="Title *"><input type="text" required maxLength={120} value={f.title} onChange={e => set('title', e.target.value)} placeholder={sched ? 'e.g. Live Q&A on career switching' : 'e.g. My new book launches this month'} autoFocus /></Field>
      <Field label="Details"><textarea rows={4} maxLength={2000} value={f.body} onChange={e => set('body', e.target.value)} placeholder="What should visitors know?" /></Field>
      <div className="cols c2">
        <Field label={sched ? 'Starts *' : 'Happens on (optional)'}><input type="datetime-local" required={sched} value={f.startsAt} onChange={e => set('startsAt', e.target.value)} /></Field>
        {sched && <Field label="Ends (optional)"><input type="datetime-local" value={f.endsAt} min={f.startsAt || undefined} onChange={e => set('endsAt', e.target.value)} /></Field>}
        <Field label="Where (optional)"><input type="text" maxLength={160} value={f.location} onChange={e => set('location', e.target.value)} placeholder="Online (Google Meet), Jaipur, Studio 2…" /></Field>
        <MediaUpload label="Link or attachment (optional)" value={f.url} onBusy={setUploading} onChange={value => set('url', value)} />
        <Field label="Link button text"><input type="text" maxLength={24} value={f.linkLabel} onChange={e => set('linkLabel', e.target.value)} placeholder={sched ? 'Join / Register' : 'Learn more'} /></Field>
        <Field label="Visibility"><select value={f.status} onChange={e => set('status', e.target.value)}><option value="published">Published: visible on my profile</option><option value="draft">Draft: only I can see it</option></select></Field>
      </div>
      {!sched && <label className="toggle"><input type="checkbox" checked={f.pinned} onChange={e => set('pinned', e.target.checked)} /> Pin to the top of my updates</label>}
      {sched && <p className="hint">Times are saved exactly and shown to each visitor in their own time zone.</p>}
      {event && <section className="card inner">
        <h3>Response form</h3>
        <p className="hint">Visitors fill in their name, email, attendance choice, optional note, and the questions you add.</p>
        <label className="toggle"><input type="checkbox" checked={f.rsvp.enabled} onChange={e => form({ enabled: e.target.checked })} />Accept Going / Not going responses</label>
        <label className="toggle"><input type="checkbox" checked={f.rsvp.showAttendees} onChange={e => form({ showAttendees: e.target.checked })} />Show attendee names when visitors consent</label>
        <label className="toggle"><input type="checkbox" checked={f.rsvp.requirePhone} onChange={e => form({ requirePhone: e.target.checked })} />Require a phone number</label>
        <h4>Custom questions</h4>
        {f.rsvp.questions.map((q, index) => <div className="card inner" key={q.id}>
          <Field label={`Question ${index + 1}`}><input type="text" maxLength={100} required value={q.label} onChange={e => form({ questions: f.rsvp.questions.map(x => x.id === q.id ? { ...x, label: e.target.value } : x) })} /></Field>
          <div className="row"><label className="toggle"><input type="checkbox" checked={q.required} onChange={e => form({ questions: f.rsvp.questions.map(x => x.id === q.id ? { ...x, required: e.target.checked } : x) })} />Required</label>
            <button type="button" className="btn small" onClick={() => form({ questions: f.rsvp.questions.filter(x => x.id !== q.id) })}>Remove question</button></div>
        </div>)}
        <button type="button" className="btn small" disabled={f.rsvp.questions.length >= 6} onClick={() => form({ questions: [...f.rsvp.questions, { id: `q_${crypto.randomUUID()}`, label: '', required: false }] })}>Add question</button>
        <p className="hint">Up to 6 questions. Contact details and answers stay in your admin panel; the public page shows counts and permitted names.</p>
      </section>}
      <Notice kind="error">{err}</Notice>
      <div className="row"><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : item.id ? 'Save changes' : f.status === 'published' ? 'Publish' : 'Save draft'}</button><button type="button" className="btn" disabled={busy} onClick={() => onDone(false)}>Cancel</button></div>
      </fieldset>
    </form>
  );
}

function EventResponses({ event }) {
  const { data, error, reload } = useOp('events.responses', { eventId: event.id });
  const [msg, setMsg] = useState('');
  if (!data) return <Loading error={error} />;
  const going = data.filter(r => r.response === 'going').length;
  return <section className="card inner">
    <div className="head"><h3>Responses to {event.title}</h3><button className="btn small" onClick={reload}>Refresh</button></div>
    <p className="hint">{going} going · {data.length - going} not going</p>
    <Notice kind="error">{msg}</Notice>
    {!data.length && <p className="muted">No responses yet.</p>}
    {data.map(r => <div className="card inner" key={r.id}>
      <div className="head"><div><b>{r.name}</b> <span className="pill">{r.response === 'going' ? 'Going' : 'Not going'}</span></div>
        <Confirm label="Delete response" warn="Delete this visitor’s response? Attendance counts will also change." onConfirm={async () => { try { await api('events.deleteResponse', { eventId: event.id, id: r.id }); setMsg(''); reload(); } catch (e) { setMsg(e.message); } }} /></div>
      <p className="muted"><a href={`mailto:${r.email}`}>{r.email}</a>{r.phone && <> · {r.phone}</>} · {fmtStamp(r.updated_at || r.created_at)}</p>
      {r.note && <p>{r.note}</p>}
      {(r.answers || []).map(a => <p key={a.id}><b>{a.label}:</b> {a.value || '—'}</p>)}
      <small className="muted">{r.public_name ? 'Consented to show name publicly' : 'Name kept private'}</small>
    </div>)}
  </section>;
}

export default function Updates({ embedded = false } = {}) {
  return <UploadGroup>{uploading => <fieldset className="editor-fieldset" disabled={uploading} onClickCapture={event => { if (uploading && event.target.closest('a')) event.preventDefault(); }}><UpdatesContent embedded={embedded} /></fieldset>}</UploadGroup>;
}
function UpdatesContent({ embedded }) {
  const { user } = useAuth();
  const { data, error, reload } = useOp('updates.list');
  const [kind, setKind] = useAdminTab({ values: Object.keys(COPY), defaultValue: 'update', parameter: 'kind' });
  const [edit, setEdit] = useState(null), [msg, setMsg] = useState(null), [responses, setResponses] = useState(null);
  const [editorBusy, setEditorBusy] = useState(false);
  useEffect(() => { setEdit(null); setMsg(null); setResponses(null); }, [kind]);

  const list = useMemo(() => {
    const rows = (data || []).filter(r => r.kind === kind);
    return kind !== 'update' ? [...rows].sort((a, b) => String(b.startsAt).localeCompare(String(a.startsAt))) : [...rows].sort((a, b) => (b.pinned - a.pinned) || String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [data, kind]);
  if (!data) return <Loading error={error} />;

  const now = Date.now(), overIds = new Set(splitSchedule(data.filter(r => r.kind !== 'update' && r.startsAt), now).past.map(x => x.id));
  const count = k => data.filter(r => r.kind === k).length;
  const toggle = async r => { try { await api('updates.save', { ...r, status: r.status === 'published' ? 'draft' : 'published' }); reload(); } catch (ex) { setMsg({ kind: 'error', t: ex.message }); } };
  const done = changed => { setEdit(null); if (changed) { setMsg({ kind: 'success', t: 'Saved. Published posts show on your profile within about 30 seconds.' }); reload(); } };

  return (
    <>
      <div className="head">
        <div>
          <h1>Events &amp; updates</h1>
          <p className="muted" style={{ margin: 0 }}>Post what is new and what is coming up. Published items appear on your public profile{user.slug && <> at <a href={`/p/${user.slug}/updates`} target="_blank" rel="noreferrer">/p/{user.slug}/updates</a></>}.</p>
        </div>
      </div>
      <AdminTabs label="Event and update types" value={kind} items={Object.entries(COPY).map(([key, c]) => ({ id: key, label: c.tab, icon: key === 'update' ? 'pen' : 'calendar', count: count(key) }))} onChange={setKind} />
      <p className="hint" style={{ marginTop: 0 }}>{COPY[kind].hint}</p>
      <Notice kind={msg?.kind}>{msg?.t}</Notice>

      <button className="btn primary" onClick={() => { setMsg(null); setEdit(blank(kind)); }}>{COPY[kind].add}</button>
      {edit && <FormDialog title={edit.id ? `Edit ${COPY[edit.kind].tab.toLowerCase()}` : COPY[edit.kind].add} busy={editorBusy} onClose={() => setEdit(null)}><UpdateEditor dialog key={edit.id || 'new'} item={edit} onBusy={setEditorBusy} onDone={changed => { setEditorBusy(false); done(changed); }} /></FormDialog>}

      <section className="card" style={{ marginTop: 18 }}>
        {!list.length && <p className="muted">{COPY[kind].empty}</p>}
        {list.map(r => <Fragment key={r.id}>
          <div className="tr upd-row" key={r.id}>
            <div>
              <b>{r.title}</b>{' '}
              <span className={`pill ${r.status}`}>{r.status}</span>
              {r.pinned && <span className="pill draft">pinned</span>}
              {r.kind !== 'update' && <span className={`pill ${overIds.has(r.id) ? 'archived' : 'active'}`}>{overIds.has(r.id) ? 'past' : 'upcoming'}</span>}
              <div className="muted">{r.startsAt ? `${r.kind === 'schedule' ? 'Starts' : 'On'} ${fmtStamp(r.startsAt)}` : `Posted ${fmtStamp(r.createdAt)}`}{r.location ? ` · ${r.location}` : ''}</div>
              {r.body && <div className="muted upd-body">{r.body}</div>}
            </div>
            <div className="row end">
              {r.kind === 'event' && <button className="btn small" aria-expanded={responses === r.id} onClick={() => setResponses(responses === r.id ? null : r.id)}>Responses</button>}
              <button className="btn small" onClick={() => toggle(r)}>{r.status === 'published' ? 'Unpublish' : 'Publish'}</button>
              <button className="btn small" onClick={() => { setMsg(null); setEdit(r); window.scrollTo?.({ top: 0, behavior: 'smooth' }); }}>Edit</button>
              <Confirm label="Delete" warn={r.kind === 'event' ? 'Delete this event and its responses for good?' : 'Delete this post for good?'} onConfirm={async () => { try { await api('updates.delete', { id: r.id }); reload(); } catch (e) { setMsg({ kind: 'error', t: e.message }); } }} />
            </div>
          </div>
          {responses === r.id && <EventResponses event={r} />}
        </Fragment>)}
      </section>
    </>
  );
}
