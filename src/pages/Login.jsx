import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useOp } from '../lib/hooks.js';
import { Field, Notice } from '../components/Ui.jsx';

export default function Login() {
  const { setUser } = useAuth();
  const [params] = useSearchParams();
  const { data: cfg } = useOp('auth.config');
  const mode = cfg?.mode || 'open';
  const canRegister = mode !== 'closed';
  const [tab, setTab] = useState(params.get('invite') ? 'register' : 'login');
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
        <h1>Studio</h1>
        <div className="tabs" role="tablist">
          <button role="tab" className={tab === 'login' ? 'on' : ''} onClick={() => setTab('login')}>Sign in</button>
          {canRegister && <button role="tab" className={tab === 'register' ? 'on' : ''} onClick={() => setTab('register')}>Create account</button>}
        </div>
        <form className="card" onSubmit={submit}>
          {tab === 'register' && <Field label="Your name"><input type="text" value={f.name} onChange={set('name')} autoComplete="name" /></Field>}
          <Field label="Email"><input type="email" value={f.email} onChange={set('email')} autoComplete="email" required /></Field>
          <Field label={tab === 'register' ? 'Password (at least 8 characters)' : 'Password'}>
            <input type="password" value={f.password} onChange={set('password')} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} required />
          </Field>
          {tab === 'register' && <Field label="Confirm password"><input type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" required /></Field>}
          {tab === 'register' && mode === 'invite' && <Field label="Invite code"><input type="text" value={f.invite} onChange={set('invite')} required /></Field>}
          <Notice kind="error">{err}</Notice>
          <button className="btn primary block" disabled={busy}>{tab === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
      </div>
    </div>
  );
}
