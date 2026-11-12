import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Button } from 'open-glass-ui';
import { Glass } from '../components/Glass.jsx';
import GlassShell from '../components/GlassShell.jsx';
import { Field, Notice, Pill } from '../components/Ui.jsx';

const fmt = code => code ? (code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code) : '';

export default function Register() {
  return <GlassShell><RegisterInner /></GlassShell>;
}

function RegisterInner() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();

  // If already logged in, redirect to admin
  useEffect(() => {
    if (user) navigate(user.isSuperAdmin ? '/superadmin' : '/admin', { replace: true });
  }, [user, navigate]);

  const rawParamCode = params.code || searchParams.get('invite') || '';
  const [inputCode, setInputCode] = useState(rawParamCode);
  const [verifiedInvite, setVerifiedInvite] = useState(null);
  const [validating, setValidating] = useState(false);
  const [validateErr, setValidateErr] = useState('');

  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '' });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });

  // Function to validate invite code
  async function checkCode(codeToCheck) {
    const clean = String(codeToCheck || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean) {
      setValidateErr('Please enter an invitation code.');
      setVerifiedInvite(null);
      return;
    }
    setValidating(true);
    setValidateErr('');
    try {
      const res = await api('invites.validate', { code: clean });
      if (res.ok) {
        setVerifiedInvite(res);
        setValidateErr('');
      } else {
        setVerifiedInvite(null);
        setValidateErr(res.error || 'Invalid or expired invitation link.');
      }
    } catch (ex) {
      setVerifiedInvite(null);
      setValidateErr(ex.message || 'Could not verify invitation link.');
    }
    setValidating(false);
  }

  // Validate on load if code in URL
  useEffect(() => {
    if (rawParamCode) {
      checkCode(rawParamCode);
    }
  }, [rawParamCode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRegister(e) {
    e.preventDefault();
    if (!verifiedInvite?.code) {
      setErr('A valid invitation code is required.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const r = await api('auth.register', {
        ...f,
        invite: verifiedInvite.code,
      });
      if (r.error) {
        setErr(r.error);
      } else {
        setUser(r.user);
        navigate(r.user?.isSuperAdmin ? '/superadmin' : '/admin', { replace: true });
      }
    } catch (ex) {
      setErr(ex.message || 'Registration failed.');
    }
    setBusy(false);
  }

  return (
    <div className="login">
      <div className="box">
        <div className="login-orb" aria-hidden="true" />
        <h1>Studio</h1>
        <p className="login-sub">
          {verifiedInvite ? "You're invited! Set up your account to launch your AI persona." : "Exclusive Access. Join the private creator platform."}
        </p>

        {/* Step 1: No verified code yet - prompt for code */}
        {!verifiedInvite && (
          <Glass material="regular" className="card" style={{ width: '100%', textAlign: 'left' }}>
            <h3 style={{ margin: '0 0 8px' }}>Invitation required</h3>
            <p className="muted" style={{ fontSize: '.9rem', margin: '0 0 16px' }}>
              Registration on Studio is by invitation only. If you received an invite link or code from a Super Admin, enter it below to proceed.
            </p>
            <form onSubmit={e => { e.preventDefault(); checkCode(inputCode); }}>
              <Field label="Invitation code">
                <input
                  type="text"
                  placeholder="e.g. ABCD-EFGH"
                  value={inputCode}
                  onChange={e => setInputCode(e.target.value.toUpperCase())}
                  autoFocus
                  required
                />
              </Field>
              <Notice kind="error">{validateErr}</Notice>
              <Button type="submit" variant="primary" size="large" disabled={validating} style={{ width: '100%', marginTop: 8 }}>
                {validating ? 'Verifying…' : 'Continue with invite'}
              </Button>
            </form>
          </Glass>
        )}

        {/* Step 2: Code verified - show registration form */}
        {verifiedInvite && (
          <form onSubmit={handleRegister}>
            <Glass material="regular" className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14, padding: '8px 12px', background: 'rgba(127,214,194,.12)', borderRadius: 12, border: '1px solid rgba(127,214,194,.3)' }}>
                <div>
                  <span style={{ fontSize: '.78rem', color: '#9be8d6', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block' }}>Verified Invitation</span>
                  <code style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', background: 'none', padding: 0 }}>
                    {fmt(verifiedInvite.code)}
                  </code>
                  {verifiedInvite.label && (
                    <span style={{ display: 'block', fontSize: '.8rem', color: 'var(--muted)', marginTop: 2 }}>
                      For: {verifiedInvite.label}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="btn link"
                  style={{ fontSize: '.8rem', color: 'var(--muted)', cursor: 'pointer' }}
                  onClick={() => { setVerifiedInvite(null); setInputCode(''); }}
                >
                  Change
                </button>
              </div>

              <Field label="Your full name">
                <input type="text" value={f.name} onChange={set('name')} autoComplete="name" placeholder="e.g. Alex Rivera" required />
              </Field>
              <Field label="Email address">
                <input type="email" value={f.email} onChange={set('email')} autoComplete="email" placeholder="you@example.com" required />
              </Field>
              <Field label="Create password (at least 8 characters)">
                <input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" required />
              </Field>
              <Field label="Confirm password">
                <input type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" required />
              </Field>

              <Notice kind="error">{err}</Notice>

              <Button type="submit" variant="primary" size="large" disabled={busy} style={{ width: '100%', marginTop: 6 }}>
                {busy ? 'Creating your account…' : 'Accept invite & create account'}
              </Button>
            </Glass>
          </form>
        )}

        <ul className="login-points" aria-label="What you get">
          <li>Your own AI persona</li>
          <li>Sell your work directly</li>
          <li>A public profile</li>
        </ul>

        <p className="login-back" style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          <Link to="/admin">Already have an account? Sign in</Link>
          <span>•</span>
          <Link to="/">← Back to site</Link>
        </p>
      </div>
    </div>
  );
}

