import { useState } from 'react';
import { api } from '../lib/api.js';
import { useOp } from '../lib/hooks.js';
import { Field, Loading, Notice } from '../components/Ui.jsx';
import JobsProfileView from '../components/JobsProfileView.jsx';
export default function JobsProfileReviews() {
  const { data, error, reload } = useOp('platform.jobsProfile.list');
  const [query, setQuery] = useState(''), [selected, setSelected] = useState(null), [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  if (!data) return <><Loading error={error} label="Loading Jobs Profiles…" />{error && <button className="btn" onClick={reload}>Retry</button>}</>;
  const profiles = data.profiles.filter(profile => `${profile.name} ${profile.email} ${profile.slug}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <><div className="head"><div><h1>Jobs Profiles</h1><p className="muted">Review saved sections using your enabled Superadmin access.</p></div><button className="btn" disabled={busy} onClick={reload}>Refresh</button></div><Field label="Search Jobs Profiles"><input type="search" value={query} onChange={event => setQuery(event.target.value)} /></Field><Notice kind="error">{failure}</Notice><section className="card"><div className="governance-table"><table className="data"><thead><tr><th>Profile</th><th>Username</th><th>Actions</th></tr></thead><tbody>{profiles.map(profile => <tr key={profile.id}><td><strong>{profile.name}</strong><small className="governance-detail">{profile.email}</small></td><td>{profile.slug}</td><td><button className="btn" disabled={busy} onClick={async () => { setBusy(true); setFailure(''); setSelected(null); try { setSelected(await api('platform.jobsProfile.get', { id: profile.id })); } catch (error) { setFailure(error.message); } finally { setBusy(false); } }}>Review profile</button></td></tr>)}</tbody></table></div>{!profiles.length && <p>No saved Jobs Profiles match this view.</p>}</section>{selected && <section><div className="head"><h2>Profile details</h2><button className="btn" onClick={() => setSelected(null)}>Close review</button></div><JobsProfileView data={selected} embedded /></section>}</>;
}
