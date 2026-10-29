import { useState } from 'react';
import { api } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';
import { useOp } from '../lib/hooks.js';
import { Field, Loading, Notice, Pill } from '../components/Ui.jsx';

const fmt = code => `${code.slice(0, 4)}-${code.slice(4)}`;

export default function Invites() {
  const { user } = useAuth();
  const { data, reload, error } = useOp('invites.list');
  const [label, setLabel] = useState(''), [uses, setUses] = useState(1), [days, setDays] = useState(14), [code, setCode] = useState('');
  if (!user.isAdmin) return <Notice kind="error">This page is for admins. Add your email to ADMIN_EMAILS in the environment variables.</Notice>;
  if (!data) return <Loading error={error} />;
  const now = Date.now();
  const labels = Object.fromEntries(data.codes.map(c => [c.id, c.label || fmt(c.code)]));
  const statusOf = c => c.revoked ? 'revoked' : c.expires_at && new Date(c.expires_at) < now ? 'expired' : c.uses >= c.max_uses ? 'used up' : 'active';

  return (
    <>
      <h1>Invites and users</h1>
      <p className="muted">Registration mode is set by <code>REGISTRATION_MODE</code> in the environment: <b>open</b>, <b>invite</b> or <b>closed</b>. Codes only matter in invite mode.</p>
      <section className="card">
        <h3>New invite code</h3>
        <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={async e => { e.preventDefault(); const r = await api('invites.create', { label, maxUses: uses, days }); setCode(r.code); reload(); }}>
          <div className="grow"><Field label="Label"><input type="text" value={label} placeholder="e.g. Skyline Scholars team" onChange={e => setLabel(e.target.value)} /></Field></div>
          <div style={{ width: 110 }}><Field label="Max uses"><input type="number" min={1} max={1000} value={uses} onChange={e => setUses(+e.target.value)} /></Field></div>
          <div style={{ width: 200 }}><Field label="Expires in (days, 0 = never)"><input type="number" min={0} max={365} value={days} onChange={e => setDays(+e.target.value)} /></Field></div>
          <button className="btn primary" style={{ marginBottom: 12 }}>Create code</button>
        </form>
        {code && <Notice kind="success">Code created. Copy it now or use the link.<br /><code>{fmt(code)}</code><br /><code>{`${location.origin}/admin?invite=${code}`}</code></Notice>}
      </section>
      <section className="card">
        <h3>Codes</h3>
        {!data.codes.length && <p className="muted">No codes yet.</p>}
        <table className="data"><tbody>
          {data.codes.map(c => {
            const s = statusOf(c);
            return (
              <tr key={c.id}><td><code>{fmt(c.code)}</code></td><td>{c.label || ''}</td><td>{c.uses} / {c.max_uses} used</td><td><Pill status={s} /></td>
                <td>{s === 'active' && <button className="btn" onClick={async () => { await api('invites.revoke', { id: c.id }); reload(); }}>Revoke</button>}</td></tr>
            );
          })}
        </tbody></table>
      </section>
      <section className="card">
        <h3>Users</h3>
        <table className="data"><thead><tr><th>Email</th><th>Name</th><th>Joined</th><th>Invite</th></tr></thead>
          <tbody>{data.users.map(u => <tr key={u.email}><td>{u.email}</td><td>{u.name || ''}</td><td>{fmtDate(u.created_at)}</td><td>{labels[u.invite_code_id] || ''}</td></tr>)}</tbody></table>
      </section>
    </>
  );
}
