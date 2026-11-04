// Admin → Updates & Schedule. Whatever is published here appears on the member's public profile (/p/<slug>/updates and the
// "What's new" block on their home page). Drafts stay private.
import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useOp } from '../lib/hooks.js';
import { fmtStamp, fromLocalInput, toLocalInput } from '../lib/when.js';
import { splitSchedule } from '../../shared/engage.js';
import { Confirm, Field, Loading, Notice } from '../components/Ui.jsx';

const blank = kind => ({ kind, title: '', body: '', startsAt: '', endsAt: '', location: '', url: '', linkLabel: '', status: 'published', pinned: false });
const COPY = {
  update: { tab: 'Upcoming updates', add: 'New update', empty: 'No updates yet. Post news, launches or announcements and they appear on your profile.', hint: 'News, launches and announcements. Add a date in the future and it shows as Upcoming.' },
  schedule: { tab: 'Schedule', add: 'New schedule item', empty: 'Nothing scheduled. Add sessions, talks, office hours or events with a date and time.', hint: 'Dated sessions, talks and events. Visitors see them soonest first, with an add-to-calendar link.' },
};

function Editor({ item, onDone }) {
  const [f, setF] = useState({ ...item, startsAt: toLocalInput(item.startsAt), endsAt: toLocalInput(item.endsAt) });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const sched = f.kind === 'schedule';

  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await api('updates.save', { ...f, startsAt: fromLocalInput(f.startsAt), endsAt: fromLocalInput(f.endsAt) }); onDone(true); }
    catch (ex) { setErr(ex.message); setBusy(false); }
  }
  return (
    <form className="card inner" onSubmit={submit}>
      <Field label="Title *"><input type="text" maxLength={120} value={f.title} onChange={e => set('title', e.target.value)} placeholder={sched ? 'e.g. Live Q&A on career switching' : 'e.g. My new book launches this month'} autoFocus /></Field>
      <Field label="Details"><textarea rows={4} maxLength={2000} value={f.body} onChange={e => set('body', e.target.value)} placeholder="What should visitors know?" /></Field>
      <div className="cols c2">
        <Field label={sched ? 'Starts *' : 'Happens on (optional)'}><input type="datetime-local" value={f.startsAt} onChange={e => set('startsAt', e.target.value)} /></Field>
        {sched && <Field label="Ends (optional)"><input type="datetime-local" value={f.endsAt} min={f.startsAt || undefined} onChange={e => set('endsAt', e.target.value)} /></Field>}
        <Field label="Where (optional)"><input type="text" maxLength={160} value={f.location} onChange={e => set('location', e.target.value)} placeholder="Online (Google Meet), Jaipur, Studio 2…" /></Field>
        <Field label="Link (optional)"><input type="text" maxLength={500} value={f.url} onChange={e => set('url', e.target.value)} placeholder="https://…" /></Field>
        <Field label="Link button text"><input type="text" maxLength={24} value={f.linkLabel} onChange={e => set('linkLabel', e.target.value)} placeholder={sched ? 'Join / Register' : 'Learn more'} /></Field>
        <Field label="Visibility"><select value={f.status} onChange={e => set('status', e.target.value)}><option value="published">Published: visible on my profile</option><option value="draft">Draft: only I can see it</option></select></Field>
      </div>
      {!sched && <label className="toggle"><input type="checkbox" checked={f.pinned} onChange={e => set('pinned', e.target.checked)} /> Pin to the top of my updates</label>}
      {sched && <p className="hint">Times are saved exactly and shown to each visitor in their own time zone.</p>}
      <Notice kind="error">{err}</Notice>
      <div className="row"><button className="btn primary" disabled={busy}>{item.id ? 'Save changes' : f.status === 'published' ? 'Publish' : 'Save draft'}</button><button type="button" className="btn" onClick={() => onDone(false)}>Cancel</button></div>
    </form>
  );
}

export default function Updates() {
  const { user } = useAuth();
  const { data, error, reload } = useOp('updates.list');
  const [kind, setKind] = useState('update'), [edit, setEdit] = useState(null), [msg, setMsg] = useState(null);

  const list = useMemo(() => {
    const rows = (data || []).filter(r => r.kind === kind);
    return kind === 'schedule' ? [...rows].sort((a, b) => String(b.startsAt).localeCompare(String(a.startsAt))) : [...rows].sort((a, b) => (b.pinned - a.pinned) || String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [data, kind]);
  if (!data) return <Loading error={error} />;

  const now = Date.now(), overIds = new Set(splitSchedule(data.filter(r => r.kind === 'schedule' && r.startsAt), now).past.map(x => x.id));
  const count = k => data.filter(r => r.kind === k).length;
  const toggle = async r => { try { await api('updates.save', { ...r, status: r.status === 'published' ? 'draft' : 'published' }); reload(); } catch (ex) { setMsg({ kind: 'error', t: ex.message }); } };
  const done = changed => { setEdit(null); if (changed) { setMsg({ kind: 'success', t: 'Saved. Published posts show on your profile within about 30 seconds.' }); reload(); } };

  return (
    <>
      <div className="head">
        <div>
          <h1>Updates &amp; Schedule</h1>
          <p className="muted" style={{ margin: 0 }}>Post what is new and what is coming up. Published items appear on your public profile{user.slug && <> at <a href={`/p/${user.slug}/updates`} target="_blank" rel="noreferrer">/p/{user.slug}/updates</a></>}.</p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {Object.entries(COPY).map(([k, c]) => <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setEdit(null); setMsg(null); }}>{c.tab} ({count(k)})</button>)}
      </div>
      <p className="hint" style={{ marginTop: 0 }}>{COPY[kind].hint}</p>
      <Notice kind={msg?.kind}>{msg?.t}</Notice>

      {edit ? <Editor key={edit.id || 'new'} item={edit} onDone={done} /> : <button className="btn primary" onClick={() => { setMsg(null); setEdit(blank(kind)); }}>{COPY[kind].add}</button>}

      <section className="card" style={{ marginTop: 18 }}>
        {!list.length && <p className="muted">{COPY[kind].empty}</p>}
        {list.map(r => (
          <div className="tr upd-row" key={r.id}>
            <div>
              <b>{r.title}</b>{' '}
              <span className={`pill ${r.status}`}>{r.status}</span>
              {r.pinned && <span className="pill draft">pinned</span>}
              {r.kind === 'schedule' && <span className={`pill ${overIds.has(r.id) ? 'archived' : 'active'}`}>{overIds.has(r.id) ? 'past' : 'upcoming'}</span>}
              <div className="muted">{r.startsAt ? `${r.kind === 'schedule' ? 'Starts' : 'On'} ${fmtStamp(r.startsAt)}` : `Posted ${fmtStamp(r.createdAt)}`}{r.location ? ` · ${r.location}` : ''}</div>
              {r.body && <div className="muted upd-body">{r.body}</div>}
            </div>
            <div className="row end">
              <button className="btn small" onClick={() => toggle(r)}>{r.status === 'published' ? 'Unpublish' : 'Publish'}</button>
              <button className="btn small" onClick={() => { setMsg(null); setEdit(r); window.scrollTo?.({ top: 0, behavior: 'smooth' }); }}>Edit</button>
              <Confirm label="Delete" warn="Delete this post for good?" onConfirm={async () => { await api('updates.delete', { id: r.id }); reload(); }} />
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
