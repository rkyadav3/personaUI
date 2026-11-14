import { useState } from 'react';
import { api } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';
import { useOp } from '../lib/hooks.js';
import { Field, Loading, Notice, Pill, Stats } from '../components/Ui.jsx';
import FormDialog from '../components/FormDialog.jsx';
import '../styles/governance.css';
const format = code => code?.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
const status = code => code.revoked ? 'revoked' : code.expires_at && new Date(code.expires_at) <= new Date() ? 'expired' : code.uses >= code.max_uses ? 'used up' : 'active';
export default function Invites() {
  const { user } = useAuth();
  const { data, reload, error } = useOp('invites.list');
  if (!data) return <Loading error={error} label="Loading invite history…" />;
  return <InviteManager user={user} data={data} reload={reload} />;
}
export function InviteManager({ user, data, reload }) {
  const [label, setLabel] = useState(''), [uses, setUses] = useState(1), [days, setDays] = useState(14), [code, setCode] = useState('');
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(null);
  const [creating, setCreating] = useState(false);
  const codes = data.codes || [], redemptions = data.redemptions || [];
  const link = value => `${window.location.origin}/invite/${value}`;
  async function create(event) {
    event.preventDefault(); setBusy(true); setNotice(null);
    try { const result = await api('invites.create', { label, maxUses: uses, days }); setCode(result.code); setLabel(''); await reload(); }
    catch (error) { setNotice({ kind: 'error', text: error.message }); }
    finally { setBusy(false); }
  }
  async function copy(value) {
    try { await navigator.clipboard.writeText(link(value)); setNotice({ kind: 'success', text: 'Invite link copied.' }); }
    catch { setCode(value); setCreating(true); setNotice({ kind: 'error', text: 'Could not copy. Select and copy the link below.' }); }
  }
  async function revoke(id) {
    setBusy(true); setNotice(null);
    try { await api('invites.revoke', { id }); await reload(); setNotice({ kind: 'success', text: 'Invite revoked.' }); }
    catch (error) { setNotice({ kind: 'error', text: error.message }); }
    finally { setBusy(false); }
  }
  return <><h1>Invite links</h1><p className="muted">{user?.isSuperAdmin ? 'Track every invite link, its creator and the members who joined.' : 'Invite someone to the platform. Your links and the people who join through them are recorded here.'}</p>
    <Stats items={[{ n: codes.length, label: 'Created links' }, { n: codes.filter(code => status(code) === 'active').length, label: 'Active links' }, { n: redemptions.length, label: 'Members invited' }]} />{notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
    <button type="button" className="btn primary" onClick={() => { setCode(''); setNotice(null); setCreating(true); }}>Create invite link</button>
    {creating && <FormDialog title="Create invite link" busy={busy} onClose={() => setCreating(false)}><form className="governance-form" onSubmit={create}><Field label="Recipient or note"><input type="text" maxLength={200} value={label} onChange={event => setLabel(event.target.value)} placeholder="Who is this invitation for?" /></Field><div className="cols c2"><Field label="Maximum uses"><input type="number" required min={1} max={1000} value={uses} onChange={event => setUses(event.target.value)} /></Field><Field label="Expires in days (0 = never)"><input type="number" required min={0} max={365} value={days} onChange={event => setDays(event.target.value)} /></Field></div><Notice kind={notice?.kind}>{notice?.text}</Notice><div className="row"><button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create invite link'}</button><button type="button" className="btn" onClick={() => setCreating(false)}>Done</button></div></form>{code && <div className="governance-created"><Field label="Invite link"><input type="text" readOnly value={link(code)} onFocus={event => event.target.select()} /></Field><button type="button" className="btn" onClick={() => copy(code)}>Copy link</button></div>}</FormDialog>}
    <section className="card governance-card"><div className="head"><h2>{user?.isSuperAdmin ? 'All invite links' : 'Your invite links'}</h2><button className="btn small" onClick={reload} disabled={busy}>Refresh</button></div><div className="governance-table"><table className="data"><thead><tr><th>Code & note</th><th>Created by</th><th>Uses</th><th>Created / expires</th><th>Status</th><th>Actions</th></tr></thead><tbody>{codes.map(invite => <tr key={invite.id}><td><code>{format(invite.code)}</code><small className="governance-detail">{invite.label}</small></td><td>{invite.creator?.name || invite.creator?.email || 'Former member'}<small className="governance-detail">{invite.creator?.email}</small></td><td>{invite.uses || 0} / {invite.max_uses}</td><td>{fmtDate(invite.created_at)}<small className="governance-detail">{invite.expires_at ? `Expires ${fmtDate(invite.expires_at)}` : 'Never expires'}</small></td><td><Pill status={status(invite)} /></td><td><div className="governance-actions"><button className="btn small" onClick={() => copy(invite.code)}>Copy link</button>{status(invite) === 'active' && <button className="btn small" disabled={busy} onClick={() => revoke(invite.id)}>Revoke</button>}</div></td></tr>)}{!codes.length && <tr><td colSpan={6}>No invite links yet. Create your first invitation above.</td></tr>}</tbody></table></div></section>
    <section className="card governance-card"><h2>Invited members log</h2><p className="muted">An entry is recorded when an invited person creates an account.</p><div className="governance-table"><table className="data"><thead><tr><th>Invited member</th><th>Invited by</th><th>Invite code</th><th>Joined</th></tr></thead><tbody>{redemptions.map(entry => <tr key={entry.id}><td>{entry.invited_name || entry.invited_email}<small className="governance-detail">{entry.invited_email}</small></td><td>{entry.creator_name || entry.creator_email || 'Former member'}<small className="governance-detail">{entry.creator_email}</small></td><td><code>{format(entry.code)}</code></td><td>{fmtDate(entry.joined_at)}</td></tr>)}{!redemptions.length && <tr><td colSpan={4}>No members have joined through these links yet.</td></tr>}</tbody></table></div></section>
  </>;
}
