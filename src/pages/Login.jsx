import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useOp } from '../lib/hooks.js';
import { Button, Glass, SegmentedControl } from 'open-glass-ui';
import { Field, Notice } from '../components/Ui.jsx';

export default function Login() {
  const { setUser } = useAuth();
  const [params] = useSearchParams();
  const { data: cfg } = useOp('auth.config');
  const mode = cfg?.mode || 'open';
  const canRegister = mode !== 'closed';
  const [want, setTab] = useState(params.get('invite') || params.get('tab') === 'register' ? 'register' : 'login');
  const tab = canRegister ? want : 'login';
  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '', invite: params.get('invite') || '' });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const r = await api(tab === 'login' ? 'auth.login' : 'auth.register', f);
      if (r.error) setErr(r.error); else setUser(r.user);
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  }

  return (
    <div className="login">
      <div className="box">
        <div className="login-orb" aria-hidden="true" />
        <h1>Studio</h1>
        <p className="login-sub">{tab === 'login' ? 'Welcome back. Sign in to manage your persona.' : 'Create your account and launch your own AI persona.'}</p>
        {canRegister && (
          <div className="seg">
            <SegmentedControl aria-label="Sign in or create account" value={tab} onValueChange={setTab}
              items={[{ value: 'login', label: 'Sign in' }, { value: 'register', label: 'Create account' }]} />
          </div>
        )}
        <form onSubmit={submit}><Glass material="regular" className="card">
          {tab === 'register' && <Field label="Your name"><input type="text" value={f.name} onChange={set('name')} autoComplete="name" /></Field>}
          <Field label="Email"><input type="email" value={f.email} onChange={set('email')} autoComplete="email" required /></Field>
          <Field label={tab === 'register' ? 'Password (at least 8 characters)' : 'Password'}>
            <input type="password" value={f.password} onChange={set('password')} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} required />
          </Field>
          {tab === 'register' && <Field label="Confirm password"><input type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" required /></Field>}
          {tab === 'register' && mode === 'invite' && <Field label="Invite code"><input type="text" value={f.invite} onChange={set('invite')} required /></Field>}
          <Notice kind="error">{err}</Notice>
          <Button type="submit" variant="primary" size="large" disabled={busy} style={{ width: '100%' }}>{tab === 'login' ? 'Sign in' : 'Create account'}</Button>
        </Glass></form>
        <ul className="login-points" aria-label="What you get">
          <li>Your own AI page</li><li>Sell your work directly</li><li>A public profile</li>
        </ul>
        <p className="login-back"><Link to="/">← Back to the site</Link></p>
      </div>
    </div>
  );
}
