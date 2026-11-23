import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useOp } from '../lib/hooks.js';
import { Field, Loading, Notice } from '../components/Ui.jsx';
import FormDialog from '../components/FormDialog.jsx';
import PlatformAccess from '../components/PlatformAccess.jsx';
import { PROFILE_TAGS } from '../../shared/governance.js';
import { ALL_PERMISSIONS, FEATURE_PERMISSIONS } from '../../shared/rbac.js';
import '../styles/governance.css';

export default function Master() {
  const { user } = useAuth();
  if (!user?.isSuperAdmin) return <Notice kind="error">Only the Superadmin can manage Master.</Notice>;
  return <MasterLoader />;
}
function MasterLoader() {
  const { data, error, reload } = useOp('platform.master.get');
  if (!data) return <Loading error={error} label="Loading profile tags & permissions…" />;
  return <MasterManager definitions={data.tags || []} reload={reload} />;
}
export function MasterManager({ definitions, reload }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null), [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(null), [error, setError] = useState('');
  const fixed = editing && Object.hasOwn(PROFILE_TAGS, editing);
  const filtered = definitions.filter(tag => tag.label.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => a.label.localeCompare(b.label));
  function open(tag) {
    setEditing(tag?.key || null);
    setForm(tag ? { label: tag.label, visibility: tag.visibility, permissions: [...tag.permissions], platformPermissions: tag.platform_permissions || [] } : { label: '', visibility: 'public', permissions: [...ALL_PERMISSIONS], platformPermissions: [] });
    setError(''); setNotice(null);
  }
  const close = () => { setForm(null); setEditing(null); };
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api(editing ? 'platform.tags.update' : 'platform.tags.create', editing ? { key: editing, ...(fixed ? { permissions: form.permissions, platformPermissions:form.platformPermissions } : form) } : form);
      close(); setNotice({ kind: 'success', text: 'Tag and feature permissions saved.' }); await reload();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <>
    <div className="head"><div><h1>Master</h1><p className="muted">Create tags and manage the features assigned accounts can use.</p></div><button type="button" className="btn primary" disabled={busy} onClick={() => open(null)}>Add new tag</button></div>
    <p className="master-guidance">Individual and Organisation are chosen during first-time profile setup. Assign tags in <Link to="/superadmin/profiles">Profiles</Link>. Accounts with several tags receive only permissions allowed by every tag. Accounts without tags follow Standard. Private tags hide profiles and knowledge from public visitors.</p>
    <Notice kind={notice?.kind}>{notice?.text}</Notice>
    {form && <FormDialog title={editing ? `Edit ${form.label}` : 'Create profile tag'} busy={busy} onClose={close}><form className="master-editor" onSubmit={save}>
      <div className="row"><Field label="Tag name"><input type="text" required maxLength={40} disabled={fixed || busy} value={form.label} onChange={event => setForm({ ...form, label: event.target.value })} /></Field><Field label="Tag visibility"><select disabled={fixed || busy} value={form.visibility} onChange={event => setForm({ ...form, visibility: event.target.value })}><option value="internal">Internal</option><option value="public">Public</option><option value="private">Private profile & knowledge</option></select></Field></div>
      <fieldset className="governance-tag-editor"><legend>Allowed features</legend><div className="master-permissions">{Object.entries(FEATURE_PERMISSIONS).map(([key, label]) => <label key={key}><input type="checkbox" disabled={busy} checked={form.permissions.includes(key)} onChange={event => setForm({ ...form, permissions: event.target.checked ? [...form.permissions, key] : form.permissions.filter(value => value !== key) })} /><span>{label}</span></label>)}</div></fieldset>
      <PlatformAccess value={form.platformPermissions} disabled={busy} onChange={value=>setForm({...form,platformPermissions:value})} /><p className="muted">Changes apply on the next request. The Studio assistant and combined analytics require all feature permissions. Specific platform access is managed separately.</p>
      <Notice kind="error">{error}</Notice><div className="row"><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save tag & permissions'}</button><button type="button" className="btn" disabled={busy} onClick={close}>Cancel</button></div>
    </form></FormDialog>}
    <section className="card governance-card" aria-labelledby={`${id}-directory`}><div className="head"><div><h2 id={`${id}-directory`}>Tags & permissions</h2><p className="muted">{definitions.length} tags available.</p></div><button type="button" className="btn" disabled={busy} onClick={reload}>Refresh</button></div>
      <Field label="Search tags"><input type="search" placeholder="Search by tag name" value={query} onChange={event => setQuery(event.target.value)} /></Field>
      <div className="governance-table master-table"><table className="data"><thead><tr><th scope="col">Tag</th><th scope="col">Visibility</th><th scope="col">Allowed features</th><th scope="col">Actions</th></tr></thead><tbody>{filtered.map(tag => <tr key={tag.key}><th scope="row">{tag.label}</th><td><span className={`governance-tag ${tag.visibility === 'private' ? 'private' : ''}`}>{tag.visibility === 'internal' ? 'Internal' : tag.visibility === 'private' ? 'Private' : 'Public'}</span></td><td><div className="governance-tags">{tag.permissions.length ? tag.permissions.map(key => <span className="governance-tag" key={key}>{FEATURE_PERMISSIONS[key]}</span>) : <span className="muted">No feature access</span>}</div></td><td><button type="button" className="btn small" disabled={busy} onClick={() => open(tag)} aria-label={`Edit ${tag.label} permissions`}>Edit permissions</button></td></tr>)}{!filtered.length && <tr><td colSpan={4}>No tags match your search.</td></tr>}</tbody></table></div>
    </section>
  </>;
}
