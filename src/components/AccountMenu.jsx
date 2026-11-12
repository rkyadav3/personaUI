import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import Icon from './portfolio/Icon.jsx';
import '../styles/accountMenu.css';

export default function AccountMenu({ user, onLogout, className = '' }) {
  const auth = useAuth(), root = useRef(null), trigger = useRef(null);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const account = user === undefined ? auth?.user : user;
  useEffect(() => {
    if (!open) return undefined;
    const close = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  useEffect(() => { setOpen(false); setError(''); }, [account?.id]);
  if (account === undefined) return <span className={`account-trigger ${className}`} aria-label="Checking account"><Icon n="users" size={18} /></span>;
  if (!account) return <Link to="/admin" className={`account-trigger ${className}`} aria-label="Login" title="Login"><Icon n="users" size={18} /><span>Login</span></Link>;
  async function logout() {
    setBusy(true); setError('');
    try { await (onLogout || auth?.logout)(); setOpen(false); }
    catch { setError('Could not log out. Please try again.'); }
    finally { setBusy(false); }
  }
  return <div className="account-dropdown" ref={root}>
    <button ref={trigger} type="button" className={`account-trigger ${className}`} aria-label="Account options" title="Account options" aria-expanded={open} aria-controls="public-account-options" onClick={() => setOpen(value => !value)}><Icon n="logout" size={19} /></button>
    <div id="public-account-options" className="account-options" hidden={!open}>
      <Link to={account.isSuperAdmin ? '/superadmin' : '/admin?tab=dashboard'} onClick={() => setOpen(false)}><Icon n="chart" size={17} />Dashboard</Link>
      <button type="button" onClick={logout} disabled={busy}><Icon n="logout" size={17} />{busy ? 'Logging out…' : 'Logout'}</button>
      {error && <p role="alert">{error}</p>}
    </div>
  </div>;
}
