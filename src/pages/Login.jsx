import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Button } from 'open-glass-ui';
import { Glass } from '../components/Glass.jsx';
import { Field, Notice } from '../components/Ui.jsx';

export default function Login() {
  const { setUser } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  // If visitor arrives with ?invite=CODE or ?tab=register, forward to the invite activation page
  useEffect(() => {
    const invite = params.get('invite');
    if (invite) {
      navigate(`/invite/${encodeURIComponent(invite)}`, { replace: true });
    } else if (params.get('tab') === 'register') {
      navigate('/invite', { replace: true });
    }
  }, [params, navigate]);

  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await api('auth.login', f);
      if (r.error) setErr(r.error);
      else { setUser(r.user); if (r.user?.isSuperAdmin) navigate('/superadmin', { replace: true }); }
    } catch (ex) {
      setErr(ex.message || 'Login failed.');
    }
    setBusy(false);
  }

  return (
    <div className="login">
      <div className="box">
        <div className="login-orb" aria-hidden="true" />
        <h1>Studio</h1>
        <p className="login-sub">Welcome back. Sign in to manage your persona and content.</p>

        <form onSubmit={submit}>
          <Glass material="regular" className="card">
            <Field label="Email address">
              <input
                type="email"
                value={f.email}
                onChange={set('email')}
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                value={f.password}
                onChange={set('password')}
                autoComplete="current-password"
                required
              />
            </Field>
            <Notice kind="error">{err}</Notice>
            <Button type="submit" variant="primary" size="large" disabled={busy} style={{ width: '100%', marginTop: 4 }}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </Glass>
        </form>

        <div style={{ marginTop: 18, fontSize: '.9rem', color: 'var(--muted)', display: 'grid', gap: 8 }}>
          <p style={{ margin: 0 }}>
            Platform access is by invitation only.{' '}
            <Link to="/invite" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
              Have an invite?
            </Link>
          </p>
        </div>

        <ul className="login-points" aria-label="Platform features" style={{ marginTop: 16 }}>
          <li>Your own AI page</li>
          <li>Sell your work directly</li>
          <li>A public profile</li>
        </ul>

        <p className="login-back"><Link to="/">← Back to the site</Link></p>
      </div>
    </div>
  );
}
