import { useState } from 'react';
import { api } from '../lib/api.js';
import { Field, Notice } from './Ui.jsx';
import FormDialog from './FormDialog.jsx';
export default function ProfileCreation({ owner = false, onCreated }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', slug: '', type: 'individual', password: '' });
  return (
    <>
      <button
        className="btn primary"
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        Create admin profile
      </button>
      {open && (
        <FormDialog
          title="Create admin profile"
          busy={busy}
          onClose={() => {
            setOpen(false);
            setForm({ ...form, password: '' });
          }}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError('');
              try {
                await api('platform.profiles.create', form);
                setForm({ name: '', email: '', slug: '', type: 'individual', password: '' });
                setOpen(false);
                onCreated();
              } catch (failure) {
                setError(failure.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset className="admin-form-body" disabled={busy}>
              <Field label="Profile name">
                <input
                  required
                  maxLength={120}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Admin email">
                <input
                  type="email"
                  required
                  maxLength={160}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field label="Username">
                <input
                  required
                  minLength={3}
                  maxLength={40}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                />
              </Field>
              <Field label="Profile type">
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="individual">Individual</option>
                  <option value="organisation">Organisation</option>
                  <option value="jobs">Jobs Profile</option>
                </select>
              </Field>
              <Field label="Initial password">
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </Field>
              <p className="muted">
                {owner
                  ? 'The new administrator can sign in and complete their draft profile.'
                  : 'This profile will remain pending. Sign-in and publication are enabled only after Superadmin approval.'}
              </p>
              <Notice kind="error">{error}</Notice>
              <button className="btn primary" disabled={busy}>
                {busy ? 'Creating…' : 'Create profile'}
              </button>
            </fieldset>
          </form>
        </FormDialog>
      )}
    </>
  );
}
