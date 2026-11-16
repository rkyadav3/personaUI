import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { Busy, Field, Notice } from './Ui.jsx';
import CopyValue from './CopyValue.jsx';
import '../styles/accountSettings.css';

export default function AccountSettings() {
  const { user, setUser } = useAuth();
  const accountProfile = useOutletContext()?.workspace;
  const profileSlug = accountProfile?.workspace?.slug || user.slug;
  const [userId, setUserId] = useState(user.slug || ''), [idPassword, setIdPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(''), [notice, setNotice] = useState(null), [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const nextChange = user.userIdNextChangeAt && new Date(user.userIdNextChangeAt);
  const cooldown = nextChange && nextChange.getTime() > now;
  async function save(event, kind) {
    event.preventDefault(); if (busy) return;
    setBusy(kind); setNotice(null);
    try {
      const result = await api('account.change', kind === 'password' ? { kind, currentPassword, password, confirm } : { kind, currentPassword: idPassword, userId });
      if (result.passwordChanged) { setCurrentPassword(''); setPassword(''); setConfirm(''); setUser(null); }
      else { setUser(result.user); setUserId(result.user.slug); setIdPassword(''); setNotice({ kind: 'success', text: 'User ID updated. You can change it again in 14 days.' }); }
    } catch (error) { setNotice({ kind: 'error', text: error.message }); }
    finally { setBusy(''); }
  }
  return <div className="account-settings">
    <div className="head"><div><h1>Account settings</h1><p className="muted">Manage your sign-in security and user ID.</p></div></div>
    <Notice kind={notice?.kind}>{notice?.text}</Notice>
    {busy && <Busy label={busy === 'userId' ? 'Updating your profile address…' : 'Changing your password…'} />}
    <section className="account-setting-section"><h2>Your account details</h2><CopyValue label="Sign-in email" value={user.email || ''} />
      {!user.isSuperAdmin && <><CopyValue label="Public profile link" value={`${window.location.origin}/p/${encodeURIComponent(profileSlug)}`} /><p>Your chatbot’s information is stored by Persona. You don’t need a database name or database password to connect your website.</p>{user.workspaceEnabled && ['owner', 'admin'].includes(accountProfile?.role) && <Link className="btn primary" to="/admin/integrations">Connect my website · step-by-step setup</Link>}
        <details className="account-connection-details"><summary>Technical details for your website developer</summary><CopyValue label="Sign-in account ID" value={user.id} />{accountProfile?.workspace?.id && <CopyValue label="Persona profile ID" value={accountProfile.workspace.id} />}<CopyValue label="Persona API address" value={`${window.location.origin}/api/persona`} /><CopyValue label="Chatbot script address" value={`${window.location.origin}/persona-widget.js`} /><p>Database setup: managed by Persona. Use a private connection key from Website connections. Account and profile IDs identify records; they do not give API access.</p></details></>}
    </section>
    <section className="account-setting-section"><h2>{user.isSuperAdmin ? 'User ID' : 'Profile address name'}</h2><p>{user.isSuperAdmin ? 'Your user ID identifies your account.' : 'This name appears at the end of your personal profile link.'} You can change it once every 14 days.</p>
      {!user.isSuperAdmin && <p className="account-profile-address">Profile address: <a href={`/p/${user.slug}`}>/p/{user.slug}</a></p>}
      {!user.isSuperAdmin && <p className="hint">Changing your user ID changes your profile address. Update any links you have shared. Your content and purchases stay linked to your account.</p>}
      {cooldown && <p role="status">Next change available: <time dateTime={nextChange.toISOString()}>{nextChange.toLocaleString()}</time>.</p>}
      <form onSubmit={event => save(event, 'userId')}><fieldset className="editor-fieldset" disabled={!!busy || !!cooldown}>
        <Field label="User ID"><input aria-label="User ID" required minLength={3} maxLength={40} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={userId} placeholder="your-user-id" autoCapitalize="none" spellCheck={false} onChange={event => setUserId(event.target.value.toLowerCase())} /><span className="hint">3–40 lowercase letters, numbers or single hyphens. Your internal account ID stays the same.</span></Field>
        <Field label="Current password to confirm this change"><input type="password" required autoComplete="current-password" value={idPassword} onChange={event => setIdPassword(event.target.value)} /></Field>
        <button className="btn primary" disabled={userId.trim() === user.slug}>{busy === 'userId' ? 'Updating…' : 'Change user ID'}</button>
      </fieldset></form>
    </section>
    <section className="account-setting-section"><h2>Change password</h2><p>After changing your password, you will be signed out on every device. Sign in again with your new password.</p>
      <form onSubmit={event => save(event, 'password')}><fieldset className="editor-fieldset" disabled={!!busy}>
        <Field label="Current password"><input type="password" required autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></Field>
        <div className="cols c2"><Field label="New password"><input aria-label="New password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /><span className="hint">At least 8 characters; up to 72 bytes.</span></Field>
          <Field label="Type the new password again"><input type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} /></Field></div>
        <button className="btn primary">{busy === 'password' ? 'Updating…' : 'Change password and sign out'}</button>
      </fieldset></form>
    </section>
  </div>;
}
