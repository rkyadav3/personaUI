import { useId, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useOp } from '../lib/hooks.js';
import { fmtDate } from '../lib/format.js';
import { Confirm, Field, Loading, Notice, Stats } from '../components/Ui.jsx';
import AdminDialog from '../components/AdminDialog.jsx';
import { PROFILE_TAGS, tagLabel, isPrivateProfile } from '../../shared/governance.js';
import '../styles/governance.css';
import ProfileCreation from '../components/ProfileCreation.jsx';
import PlatformAccess from '../components/PlatformAccess.jsx';
import CreatorProfiles from './CreatorProfiles.jsx';
import {hasPlatformAccess} from '../../shared/rbac.js';
import { RevenueTotals } from './PlatformPayments.jsx';

export default function SuperAdmin() {
  const { user } = useAuth();
  if (!hasPlatformAccess(user)) return <Notice kind="error">Only the platform owner can open the SuperAdmin dashboard.</Notice>;
  return user.isSuperAdmin ? <PlatformPeople user={user} /> : <CreatorProfiles />;
}
function PlatformPeople({ user }) {
  const { data, error, reload } = useOp('users.list');
  const { pathname } = useLocation();
  if (!data) return <Loading error={error} label="Loading profiles…" />;
  return <CustomerManager user={user} users={data.users || []} definitions={data.tags} reload={reload} dashboard={pathname.replace(/\/$/, '') === '/superadmin'} />;
}
function PlatformFinancialSummary() {
  const { data, error } = useOp('platform.sales');
  return <section aria-label="Platform sales overview"><h2>Platform sales overview</h2>{data ? <><Stats items={[{ n: data.counts.paidSales, label: 'Total paid sales' }, { n: data.counts.pending, label: 'Pending payments' }]} /><RevenueTotals currencies={data.currencies} /><p className="muted">Net earnings are after refunds, before gateway fees or payouts.</p></> : <Loading error={error} label="Loading sales overview…" />}</section>;
}

export function CustomerManager({ user, users, definitions = Object.entries(PROFILE_TAGS).map(([key, label]) => ({ key, label, visibility: key === 'private' ? 'private' : 'public' })), reload, dashboard = false }) {
  const titleId = useId();
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null), [form, setForm] = useState({});
  const [passwordUser, setPasswordUser] = useState(null), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(null), [dialogError, setDialogError] = useState('');
  const locked = users.filter(person => person.isLocked).length;
  const filtered = users.filter(person => `${person.name || ''} ${person.email} ${person.slug || ''}`.toLowerCase().includes(query.trim().toLowerCase()) && (filter === 'all' || filter === 'active' && !person.isLocked || filter === 'locked' && person.isLocked || person.tags?.includes(filter)));
  async function perform(op, args, message) {
    setBusy(true); setNotice(null);
    try { await api(op, args); setNotice({ kind: 'success', text: message }); await reload(); }
    catch (error) { setNotice({ kind: 'error', text: error.message }); }
    finally { setBusy(false); }
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setDialogError('');
    try {
      if (editing) await api('users.update', { id: editing.id, ...form });
      else await api('users.resetPassword', { id: passwordUser.id, password });
      setEditing(null); setPasswordUser(null); setPassword(''); setNotice({ kind: 'success', text: 'Profile account updated.' }); await reload();
    } catch (error) { setDialogError(error.message); }
    finally { setBusy(false); }
  }
  return <>
    <div className="head"><div><span className="governance-eyebrow">PLATFORM OWNER</span><h1>{dashboard ? 'SuperAdmin dashboard' : 'Profiles'}</h1><p className="muted">Manage admin profiles, profile tags and platform access.</p></div><ProfileCreation owner onCreated={reload} /><button className="btn" onClick={reload} disabled={busy}>Refresh</button></div>
    <Stats items={[{ n: users.length, label: 'Profiles', sub: `${users.length - locked} active accounts` }, { n: users.filter(isPrivateProfile).length, label: 'Private profiles', sub: 'Owner and SuperAdmin access' }, { n: users.filter(person => person.tags?.includes('hero')).length, label: 'Hero profiles', sub: 'Public profiles' }, { n: locked, label: 'Suspended accounts', sub: 'Access restricted' }]} />
    {dashboard && <><PlatformFinancialSummary /><div className="governance-shortcuts"><Link to="/superadmin/profiles"><strong>Profile support</strong><span>Edit accounts, restore access and assign tags →</span></Link><Link to="/superadmin/master"><strong>Master</strong><span>Create profile tags and manage feature permissions →</span></Link><Link to="/superadmin/sales"><strong>Sales & payments</strong><span>Review admin earnings and manage checkout →</span></Link><Link to="/superadmin/settings"><strong>Main site settings</strong><span>Edit the public directory homepage →</span></Link><Link to="/superadmin/invites"><strong>Invite history</strong><span>See link creators and invited members →</span></Link><Link to="/superadmin/suggestions"><strong>Platform suggestions</strong><span>Review ideas and share your response →</span></Link></div></>}
    {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
    <section className="card governance-card"><h2>{dashboard ? 'Recent profiles' : 'Profile directory'}</h2>
      {!dashboard && <div className="row"><Field label="Search profiles"><input type="search" placeholder="Name, email or profile slug" value={query} onChange={event => setQuery(event.target.value)} /></Field><Field label="Filter accounts"><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All profiles</option><option value="active">Active</option><option value="locked">Suspended</option>{definitions.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}</select></Field></div>}
      <div className="governance-table"><table className="data"><thead><tr><th>Profile</th><th>Profile tags</th><th>Access</th><th>Joined</th><th>Actions</th></tr></thead><tbody>{(dashboard ? filtered.slice(0, 5) : filtered).map(person => <tr key={person.id}>
        <td><strong>{person.name || 'Unnamed profile'}</strong><small className="governance-detail">{person.email}</small><small className="governance-detail">{person.isSuperAdmin ? 'SuperAdmin' : person.isAdmin ? 'Admin' : 'Member'}{person.slug && <> · <Link to={`/p/${person.slug}`}>View profile ↗</Link></>}</small></td>
        <td><div className="governance-tags">{person.tags?.length ? person.tags.map(tag => <span className={`governance-tag ${tag}`} key={tag}>{tagLabel(tag, definitions)}</span>) : <span className="muted">Normal profile</span>}</div>{isPrivateProfile(person) && <small className="governance-detail">Hidden from public discovery and knowledge access</small>}</td>
        <td>{person.approval_status && person.approval_status!=='approved' && <p>{person.approval_status}</p>}{person.approval_status==='pending' && <div className="row"><button className="btn small" disabled={busy} onClick={()=>perform('platform.profiles.approve',{id:person.id,action:'approve'},'Profile approved.')}>Approve profile</button><button className="btn small" disabled={busy} onClick={()=>perform('platform.profiles.approve',{id:person.id,action:'reject'},'Profile declined.')}>Decline</button></div>}<span className={`governance-tag ${person.isLocked ? 'private' : 'hero'}`}>{person.isLocked ? 'Suspended' : 'Active'}</span></td><td>{fmtDate(person.created_at)}</td>
        <td><div className="governance-actions"><button className="btn small" disabled={busy} onClick={() => { setEditing(person); setForm({ name: person.name || '', email: person.email, slug: person.slug || '', tags: person.tags || [], platformPermissions:person.platformPermissions || [] }); setDialogError(''); }}>Edit & tags</button><button className="btn small" disabled={busy} onClick={() => { setPasswordUser(person); setPassword(''); setDialogError(''); }}>Password</button><button className="btn small" disabled={busy || person.id === user.id} onClick={() => perform('users.setLock', { id: person.id, locked: !person.isLocked }, person.isLocked ? 'Account restored.' : 'Account suspended.')}>{person.isLocked ? 'Unlock' : 'Suspend'}</button>{person.id !== user.id && !busy && <Confirm label="Delete" warn={`Permanently delete ${person.email} and their content?`} onConfirm={() => perform('users.delete', { id: person.id }, 'Profile deleted. Invite and suggestion history retained.')} />}</div></td>
      </tr>)}{!filtered.length && <tr><td colSpan={5}>No profiles match your search.</td></tr>}</tbody></table></div>
    </section>
    {(editing || passwordUser) && <AdminDialog titleId={titleId} onClose={() => { setEditing(null); setPasswordUser(null); }} busy={busy}><h2 id={titleId}>{editing ? 'Edit profile & profile tags' : 'Reset profile password'}</h2><form onSubmit={save}>
      {editing ? <><Field label="Name"><input type="text" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field><Field label="Email"><input type="email" required value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></Field><Field label="Profile slug"><input type="text" required value={form.slug} onChange={event => setForm({ ...form, slug: event.target.value })} /></Field><fieldset className="governance-tag-editor"><legend>Profile tags</legend>{definitions.map(({ key: tag, label, visibility }) => <label key={tag}><input type="checkbox" checked={form.tags.includes(tag)} onChange={event => setForm({ ...form, tags: event.target.checked ? [...form.tags, tag] : form.tags.filter(value => value !== tag) })} /><span><strong>{label}</strong><small>{visibility === 'internal' ? 'Internal tag: hidden from public visitors.' : visibility === 'private' ? 'Only this profile owner and the SuperAdmin can view the profile and its knowledge.' : 'A public profile, discoverable by everyone.'}</small></span></label>)}</fieldset><PlatformAccess value={form.platformPermissions} disabled={busy} onChange={value=>setForm({...form,platformPermissions:value})} /><p className="muted">Tag grants also apply. Remove Profile Creator to revoke access inherited from that tag.</p></> : <><p className="muted">Set a new password for {passwordUser.email}.</p><Field label="New password"><input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></Field></>}
      <Notice kind="error">{dialogError}</Notice><div className="row end"><button type="button" className="btn" disabled={busy} onClick={() => { setEditing(null); setPasswordUser(null); }}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
    </form></AdminDialog>}
  </>;
}
