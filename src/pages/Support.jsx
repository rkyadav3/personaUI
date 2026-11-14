import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useOp } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';
import { Field, Loading, Notice } from '../components/Ui.jsx';
import FormDialog from '../components/FormDialog.jsx';
import { SUPPORT_CATEGORIES, SUPPORT_STATUSES } from '../../shared/platformSupport.js';
import '../styles/support.css';

const supportPath = user => user?.isSuperAdmin ? '/superadmin/support' : '/admin/support';
const Status = ({ value }) => <span className={`support-status ${value}`}>{SUPPORT_STATUSES[value] || value}</span>;

export default function Support() {
  const { user } = useAuth(), { id } = useParams();
  return id ? <ConversationPage key={id} user={user} id={id} /> : <SupportPage user={user} />;
}
function SupportError({ error, reload }) {
  return <><Loading error={error} label="Loading support…" />{error && <button className="btn" type="button" onClick={reload}>Try again</button>}</>;
}
function useSupport(op, args) {
  const result = useOp(op, args), [cached, setCached] = useState(null);
  useEffect(() => { if (result.data) setCached(result.data); }, [result.data]);
  return { ...result, data: result.data || cached };
}
function SupportPage({ user }) {
  const { data, error, reload } = useSupport('support.list');
  return data ? <>{error && <SupportError error={error} reload={reload} />}<SupportList user={user} rows={data.rows || []} reload={reload} /></> : <SupportError error={error} reload={reload} />;
}
function ConversationPage({ user, id }) {
  const { data, error, reload } = useSupport('support.get', { id });
  return data ? <>{error && <SupportError error={error} reload={reload} />}<SupportConversation user={user} ticket={data.ticket} messages={data.messages || []} reload={reload} /></> : <><Link to={supportPath(user)}>Back to support</Link><SupportError error={error} reload={reload} /></>;
}

export function SupportList({ user, rows, reload }) {
  const [creating, setCreating] = useState(false), [filter, setFilter] = useState('all'), [requestBusy, setRequestBusy] = useState(false);
  const owner = user?.isSuperAdmin, visible = rows.filter(row => filter === 'all' || row.status === filter);
  return <div className="support-page">
    <div className="support-heading"><div><h1>{owner ? 'Support inbox' : 'Support'}</h1><p className="muted">{owner ? 'Help admins with account, payment and platform issues.' : 'Get help from the SuperAdmin and keep every reply in one place.'}</p></div>
      {!owner && <button type="button" className="btn primary" disabled={requestBusy} aria-haspopup="dialog" onClick={() => setCreating(true)}>New support request</button>}
    </div>
    {creating && <FormDialog title="New support request" busy={requestBusy} onClose={() => setCreating(false)}><NewRequest onBusy={setRequestBusy} onCancel={() => setCreating(false)} /></FormDialog>}
    <section className="support-requests" aria-label={owner ? 'Customer support requests' : 'Your support requests'}>
      <div className="support-list-tools"><h2>{owner ? 'Requests from admins' : 'Your requests'}</h2><div><Field label="Filter requests"><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All statuses</option>{Object.entries(SUPPORT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><button className="btn small" type="button" onClick={reload}>Refresh</button></div></div>
      {!visible.length ? <p className="support-empty">{rows.length ? 'No requests match this status.' : owner ? 'No support requests yet.' : 'No requests yet. Start a new request when you need help.'}</p> : <ul className="support-request-list">{visible.map(ticket => <li key={ticket.id}>
        <div className="support-request-summary"><Link to={`${supportPath(user)}/${ticket.id}`}>{ticket.title}</Link><p>{SUPPORT_CATEGORIES[ticket.category]}{owner && ` · ${ticket.author_name || ticket.author_email || 'Former admin'}`}</p></div>
        <div className="support-request-meta"><Status value={ticket.status} /><small>Updated {fmtDate(ticket.updated_at || ticket.created_at)}</small></div>
      </li>)}</ul>}
    </section>
  </div>;
}

function NewRequest({ onBusy, onCancel }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', category: 'technical', body: '' }), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function submit(event) {
    event.preventDefault(); setBusy(true); onBusy(true); setError('');
    try { const ticket = await api('support.create', form); if (mounted.current) navigate(`/admin/support/${ticket.id}`); }
    catch (failure) { if (mounted.current) setError(failure.message); }
    finally { if (mounted.current) { setBusy(false); onBusy(false); } }
  }
  return <section id="support-new-request" className="support-new-request"><p className="muted">Describe what happened and what you need help with.</p>
    <form onSubmit={submit}><fieldset disabled={busy} className="support-fields"><div className="support-form-row"><Field label="Subject"><input required autoFocus maxLength={160} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></Field><Field label="Category"><select value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}>{Object.entries(SUPPORT_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>
      <Field label="Describe the issue"><textarea required maxLength={5000} rows={5} value={form.body} onChange={event => setForm({ ...form, body: event.target.value })} /></Field><Notice kind="error">{error}</Notice><div className="row"><button className="btn primary">{busy ? 'Sending…' : 'Send request'}</button><button type="button" className="btn" onClick={onCancel}>Cancel</button></div></fieldset></form>
  </section>;
}

export function SupportConversation({ user, ticket, messages, reload }) {
  const owner = user?.isSuperAdmin;
  const [body, setBody] = useState(''), [status, setStatus] = useState(ticket.status), [busy, setBusy] = useState(false), [notice, setNotice] = useState(null);
  useEffect(() => setStatus(ticket.status), [ticket.status]);
  async function send(event) {
    event.preventDefault(); setBusy(true); setNotice(null);
    try {
      await api('support.reply', { id: ticket.id, body, ...(owner ? { status } : {}) });
      setBody(''); setNotice({ kind: 'success', text: owner ? 'Response saved.' : 'Reply sent.' }); await reload();
    } catch (error) { setNotice({ kind: 'error', text: error.message }); }
    finally { setBusy(false); }
  }
  return <div className="support-page support-conversation"><Link className="support-back" to={supportPath(user)}>Back to support</Link>
    <div className="support-heading"><div><h1>{ticket.title}</h1><p className="muted">Request #{ticket.id} · {SUPPORT_CATEGORIES[ticket.category]}</p></div><Status value={ticket.status} /></div>
    <ol className="support-thread" aria-label="Support conversation"><li><article><div className="support-message-heading"><strong>{ticket.author_name || 'Admin'}</strong><small>{fmtDate(ticket.created_at)}</small></div><p className="support-message-body">{ticket.body}</p></article></li>
      {messages.map(message => <li key={message.id}><article><div className="support-message-heading"><strong>{message.is_superadmin ? 'SuperAdmin' : message.author_name || 'Admin'}</strong><small>{fmtDate(message.created_at)}</small></div>{message.body && <p className="support-message-body">{message.body}</p>}<p className="support-message-status">Status: {SUPPORT_STATUSES[message.status] || message.status}</p></article></li>)}
    </ol>
    <section className="support-reply"><h2>{owner ? 'Reply & update status' : 'Reply to the SuperAdmin'}</h2>{!owner && ticket.status === 'resolved' && <p className="muted">Sending a reply reopens this request.</p>}
      <form onSubmit={send}><fieldset disabled={busy} className="support-fields"><Field label="Your reply"><textarea required={!owner} maxLength={5000} rows={4} value={body} onChange={event => setBody(event.target.value)} /></Field>
        {owner && <Field label="Request status"><select value={status} onChange={event => setStatus(event.target.value)}>{Object.entries(SUPPORT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>}
        {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}<button className="btn primary">{busy ? 'Saving…' : owner ? 'Save response' : 'Send reply'}</button>
      </fieldset></form>
    </section>
  </div>;
}
