import { useState } from 'react';
import { api } from '../lib/api.js';
import { useOp } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { Field, Loading, Notice } from '../components/Ui.jsx';
import JobsProfileView from '../components/JobsProfileView.jsx';
import { CustomerManager } from './SuperAdmin.jsx';
import { hasPlatformPermission } from '../../shared/rbac.js';
export default function JobsProfileReviews() {
  const { user } = useAuth();
  const { data, error, reload } = useOp('platform.jobsProfile.list');
  const [query, setQuery] = useState(''), [selected, setSelected] = useState(null), [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  if (!data) return <><Loading error={error} label="Loading Jobs Profiles…" />{error && <button className="btn" onClick={reload}>Retry</button>}</>;
  const profiles = data.profiles.filter(profile => `${profile.name} ${profile.email} ${profile.slug}`.toLowerCase().includes(query.trim().toLowerCase()));
  const canEdit = hasPlatformPermission(user, 'profiles.edit');
  const reviewButton = (profile, accountBusy = false) => hasPlatformPermission(user, 'profiles.review') && <button className="btn" disabled={busy || accountBusy || !profile.hasDetails || profile.approval_status !== 'approved'} onClick={async () => { setBusy(true); setFailure(''); setSelected(null); try { setSelected(await api('platform.jobsProfile.get', { id: profile.id })); } catch (error) { setFailure(error.message); } finally { setBusy(false); } }}>Review profile</button>;
  return <>
    {canEdit ? <CustomerManager user={user} users={data.profiles} definitions={data.tags} reload={async () => { setSelected(null); await reload(); }} jobSeekers extraActions={reviewButton} /> : <>
    <div className="head"><div><h1>Jobs Profiles</h1><p className="muted">Manage Job Seeker accounts and review saved sections using your enabled Superadmin access.</p></div><button className="btn" disabled={busy} onClick={reload}>Refresh</button></div>
    <Field label="Search Jobs Profiles"><input type="search" value={query} onChange={event => setQuery(event.target.value)} /></Field>
    <Notice kind="error">{failure}</Notice>
    <section className="card"><div className="governance-table"><table className="data">
      <thead><tr><th>Profile</th><th>Username</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{profiles.map(profile => <tr key={profile.id}>
        <td><strong>{profile.name}</strong><small className="governance-detail">{profile.email}</small></td><td>{profile.slug}</td><td>{profile.approval_status}</td>
        <td><div className="row">
          {reviewButton(profile)}
        </div>{!profile.hasDetails && <small className="governance-detail">Home details have not been saved yet.</small>}</td>
      </tr>)}</tbody>
    </table></div>{!profiles.length && <p>No Jobs Profiles match this view.</p>}</section>
    </>}
    {canEdit && <Notice kind="error">{failure}</Notice>}
    {selected && <section><div className="head"><h2>Profile details</h2><button className="btn" onClick={() => setSelected(null)}>Close review</button></div><JobsProfileView data={selected} embedded /></section>}
  </>;
}
