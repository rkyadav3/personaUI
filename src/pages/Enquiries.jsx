// Admin → Enquiries. Everything a visitor sends through the contact form on this member's profile arrives here, and only here.
import { useMemo, useState } from 'react';
import { ENQUIRY_STATUS, ENQUIRY_TYPES } from '../../shared/enquiryTypes.js';
import { api } from '../lib/api.js';
import { useAdminTab } from '../lib/adminTabs.js';
import { LegacyPortfolioRedirect } from './LegacyRedirects.jsx';
import { useOp } from '../lib/hooks.js';
import { fmtStamp } from '../lib/when.js';
import { Confirm, Field, Loading, Notice } from '../components/Ui.jsx';

const LABEL = { new: 'New', read: 'Read', replied: 'Replied', archived: 'Archived' };
const digits = s => String(s || '').replace(/\D/g, '');

const csvCell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };   // a leading = or + is neutralised so spreadsheets never run it as a formula
function exportCsv(rows) {
  const head = ['Received', 'Status', 'Name', 'Email', 'Phone', 'Organisation', 'Location', 'Type', 'Offering', 'Subject', 'Message', 'Preferred date', 'Preferred time', 'Meeting mode', 'Budget', 'Reply by', 'Note'];
  const lines = [head, ...rows.map(r => [r.createdAt, r.status, r.name, r.email, r.phone, r.organisation, r.location, ENQUIRY_TYPES[r.kind] || r.kind, r.offeringTitle, r.subject, r.message, r.prefDate, r.prefTime, r.meetingMode, r.budget, r.prefContact, r.note])];
  const url = URL.createObjectURL(new Blob([`\ufeff${lines.map(l => l.map(csvCell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `enquiries-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function Detail({ r, onChange, onDelete }) {
  const [note, setNote] = useState(r.note || '');
  const patch = p => api('enquiries.update', { id: r.id, ...p }).then(onChange);
  const rows = [
    ['Email', <a key="e" href={`mailto:${r.email}`}>{r.email}</a>], ['Phone', r.phone && <a key="p" href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>{r.phone}</a>],
    ['Organisation', r.organisation], ['Location', r.location], ['Related offering', r.offeringTitle],
    ['Wants to be reached by', r.prefContact], ['Preferred date', r.prefDate], ['Preferred time', r.prefTime], ['Meeting mode', r.meetingMode], ['Budget', r.budget],
  ].filter(([, v]) => v);
  const wa = digits(r.phone).length >= 8 ? `https://wa.me/${digits(r.phone)}` : '';
  return (
    <div className="card inner enq-detail">
      <div className="enq-msg">{r.message}</div>
      <dl className="enq-dl">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <div className="row">
        <a className="btn primary" href={`mailto:${r.email}?subject=${encodeURIComponent(`Re: ${r.subject}`)}`} onClick={() => r.status !== 'replied' && patch({ status: 'replied' })}>Reply by email</a>
        {wa && <a className="btn" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
        {r.phone && <a className="btn" href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>Call</a>}
        {ENQUIRY_STATUS.filter(s => s !== r.status).map(s => <button key={s} className="btn" onClick={() => patch({ status: s })}>Mark {LABEL[s].toLowerCase()}</button>)}
        <Confirm label="Delete" warn="Delete this enquiry for good?" onConfirm={onDelete} />
      </div>
      <Field label="Private note (only you can see this)">
        <textarea rows={2} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} onBlur={() => note !== (r.note || '') && patch({ note })} />
      </Field>
    </div>
  );
}

function Inbox() {
  const { data, error, reload } = useOp('enquiries.list');
  const [filter, setFilter] = useState('all'), [q, setQ] = useState(''), [open, setOpen] = useState(null);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.rows || []).filter(r => (filter === 'all' ? r.status !== 'archived' : r.status === filter)
      && (!t || [r.name, r.email, r.subject, r.message, r.organisation, r.offeringTitle].some(x => String(x || '').toLowerCase().includes(t))));
  }, [data, filter, q]);
  if (!data) return <Loading error={error} />;
  const c = data.counts;

  async function toggle(r) {
    const next = open === r.id ? null : r.id; setOpen(next);
    if (next && r.status === 'new') { await api('enquiries.update', { id: r.id, status: 'read' }).catch(() => {}); reload(); window.dispatchEvent(new Event('enquiries-changed')); }
  }
  const changed = () => { reload(); window.dispatchEvent(new Event('enquiries-changed')); };

  return (
    <>
      <div className="chips enq-filters">
        {[['all', `Inbox (${c.total - c.archived})`], ['new', `New (${c.new})`], ['read', `Read (${c.read})`], ['replied', `Replied (${c.replied})`], ['archived', `Archived (${c.archived})`]].map(([k, l]) =>
          <button key={k} className={`chip${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}
        <input type="search" className="grow" placeholder="Search name, email, subject or message" aria-label="Search enquiries" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn small" disabled={!rows.length} onClick={() => exportCsv(rows)}>Export CSV</button>
      </div>
      <section className="card">
        {!rows.length && <p className="muted">{c.total ? 'Nothing matches this view.' : 'No enquiries yet. When someone fills in the contact form on your profile, it lands here.'}</p>}
        {rows.map(r => (
          <div key={r.id}>
            <button className={`enq-row${r.status === 'new' ? ' unread' : ''}`} onClick={() => toggle(r)} aria-expanded={open === r.id}>
              <span className="enq-who"><b>{r.name}</b><small>{r.email}</small></span>
              <span className="enq-what"><b>{r.subject}</b><small>{ENQUIRY_TYPES[r.kind] || r.kind}{r.offeringTitle ? ` · ${r.offeringTitle}` : ''}</small></span>
              <span className="enq-when"><span className={`pill ${r.status}`}>{LABEL[r.status]}</span><small>{fmtStamp(r.createdAt)}</small></span>
            </button>
            {open === r.id && <Detail r={r} onChange={changed} onDelete={async () => { await api('enquiries.delete', { id: r.id }); setOpen(null); changed(); }} />}
          </div>
        ))}
      </section>
    </>
  );
}

export default function Enquiries() {
  const [tab] = useAdminTab({ values: ['inbox', 'form'], defaultValue: 'inbox' });
  if (tab === 'form') return <LegacyPortfolioRedirect tab="contact" />;
  return (
    <>
      <div className="head"><div><h1>Enquiries</h1><p className="muted" style={{ margin: 0 }}>Messages sent through the contact form on your profile arrive here and nowhere else.</p></div></div>
      <Inbox />
    </>
  );
}
