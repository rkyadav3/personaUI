import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { useOp } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';
import { Field, Loading, Notice } from '../components/Ui.jsx';
import { SUGGESTION_KINDS, SUGGESTION_STATUSES } from '../../shared/governance.js';
import '../styles/governance.css';
export default function Suggestions() {
  const { user } = useAuth();
  const { data, error, reload } = useOp('suggestions.list');
  if (!data) return <Loading error={error} label="Loading suggestions…" />;
  return <SuggestionManager user={user} rows={data.rows || []} reload={reload} />;
}
export function SuggestionManager({ user, rows, reload }) {
  const [form, setForm] = useState({ kind: 'add', title: '', body: '' }), [busy, setBusy] = useState(false), [notice, setNotice] = useState(null), [filter, setFilter] = useState('all');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setNotice(null);
    try { await api('suggestions.create', form); setForm({ kind: 'add', title: '', body: '' }); await reload(); setNotice({ kind: 'success', text: 'Your suggestion was sent to the platform owner.' }); }
    catch (error) { setNotice({ kind: 'error', text: error.message }); }
    finally { setBusy(false); }
  }
  const visible = rows.filter(row => filter === 'all' || row.status === filter);
  return <><h1>Platform suggestions</h1><p className="muted">{user?.isSuperAdmin ? 'Review what admins want to add, remove or improve. Share a response and update each suggestion’s status.' : 'Help improve the platform. Suggest something to add, remove or update, and follow the owner’s response.'}</p>{notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
    {user?.isAdmin && !user.isSuperAdmin && <section className="card"><h2>Suggest an improvement</h2><form className="governance-form" onSubmit={submit}><div className="row"><Field label="Suggestion type"><select value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value })}>{Object.entries(SUGGESTION_KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field><Field label="Title"><input type="text" required maxLength={160} placeholder="What would make the platform better?" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></Field></div><Field label="Description"><textarea required maxLength={5000} rows={4} placeholder="Explain the change and how it would help." value={form.body} onChange={event => setForm({ ...form, body: event.target.value })} /></Field><button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Send suggestion'}</button></form></section>}
    <section className="card"><div className="head"><h2>{user?.isSuperAdmin ? 'Suggestions from admins' : 'Your suggestions'}</h2><Field label="Filter status"><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All statuses</option>{SUGGESTION_STATUSES.map(value => <option key={value}>{value}</option>)}</select></Field></div>{!visible.length && <p className="muted">No suggestions here yet.</p>}{visible.map(row => <Suggestion key={`${row.id}:${row.updated_at || ''}`} row={row} owner={user?.isSuperAdmin} reload={reload} />)}</section>
  </>;
}
function Suggestion({ row, owner, reload }) {
  const [status, setStatus] = useState(row.status), [reply, setReply] = useState(row.owner_reply || ''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('suggestions.update', { id: row.id, status, reply }); await reload(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <article className="governance-suggestion"><div className="governance-tags"><span className="governance-tag">{SUGGESTION_KINDS[row.kind]}</span><span className="governance-tag special">{row.status}</span></div><h3>{row.title}</h3><p className="governance-body">{row.body}</p><small className="muted">{row.author_name || row.author_email} · {fmtDate(row.created_at)}</small>{owner ? <form onSubmit={save}><div className="row"><Field label="Status"><select value={status} onChange={event => setStatus(event.target.value)}>{SUGGESTION_STATUSES.map(value => <option key={value}>{value}</option>)}</select></Field><Field label="Reply to admin"><textarea maxLength={3000} rows={2} value={reply} onChange={event => setReply(event.target.value)} /></Field></div><Notice kind="error">{error}</Notice><button className="btn small" disabled={busy}>{busy ? 'Saving…' : 'Save response'}</button></form> : row.owner_reply && <blockquote className="governance-body"><strong>Platform owner’s response</strong><p>{row.owner_reply}</p></blockquote>}</article>;
}
