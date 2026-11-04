import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';
import { useOp } from '../lib/hooks.js';
import { Button } from 'open-glass-ui';
import { Glass } from '../components/Glass.jsx';
import { Confirm, Field, Loading, Notice, Pill, Stats } from '../components/Ui.jsx';

const fmt = code => (code && code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code || '');

export default function SuperAdmin() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data, reload, error } = useOp('users.list');

  const activeTab = params.get('tab') === 'invites' ? 'invites' : 'users';
  const setTab = tab => setParams(tab === 'users' ? {} : { tab });

  // Filters for user list
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');

  // New Invite form state
  const [label, setLabel] = useState('');
  const [uses, setUses] = useState(1);
  const [days, setDays] = useState(14);
  const [createdCode, setCreatedCode] = useState('');
  const [copied, setCopied] = useState(false);

  // Edit user modal state
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', slug: '' });
  const [editErr, setEditErr] = useState(''), [editBusy, setEditBusy] = useState(false);

  // Reset password modal state
  const [pwdUser, setPwdUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwdErr, setPwdErr] = useState(''), [pwdBusy, setPwdBusy] = useState(false);

  // Notification message
  const [actionNotice, setActionNotice] = useState(null);

  if (!user?.isAdmin) {
    return (
      <Notice kind="error">
        This area is restricted to Super Administrators. You are signed in as <b>{user?.email}</b>. Add that exact email to <code>ADMIN_EMAILS</code> (or <code>SUPERADMIN_EMAILS</code>) in Vercel → Settings → Environment Variables, then redeploy.
      </Notice>
    );
  }

  if (!data) return <Loading error={error} />;

  const now = Date.now();
  const codes = data.codes || [];
  const users = data.users || [];

  const codeStatus = c =>
    c.revoked ? 'revoked' : c.expires_at && new Date(c.expires_at) < now ? 'expired' : c.uses >= c.max_uses ? 'used up' : 'active';

  const activeCodesCount = codes.filter(c => codeStatus(c) === 'active').length;
  const totalUses = codes.reduce((sum, c) => sum + (c.uses || 0), 0);
  const lockedUsersCount = users.filter(u => u.isLocked).length;

  const filteredUsers = users.filter(u => {
    const q = search.trim().toLowerCase();
    const matchQuery =
      !q ||
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.slug || '').toLowerCase().includes(q);
    if (!matchQuery) return false;

    if (filterRole === 'active') return !u.isLocked;
    if (filterRole === 'locked') return u.isLocked;
    if (filterRole === 'admin') return u.isAdmin;
    return true;
  });

  const statsItems = [
    { n: users.length, label: 'Total Users', sub: `${users.length - lockedUsersCount} active` },
    { n: lockedUsersCount, label: 'Locked / Suspended', sub: lockedUsersCount ? 'Needs review' : 'All clear' },
    { n: activeCodesCount, label: 'Active Invites', sub: `${codes.length} total generated` },
    { n: totalUses, label: 'Invites Redeemed', sub: 'Members joined' },
  ];

  async function handleCreateInvite(e) {
    e.preventDefault();
    setActionNotice(null);
    try {
      const res = await api('invites.create', { label, maxUses: uses, days });
      setCreatedCode(res.code);
      setLabel('');
      setUses(1);
      setDays(14);
      reload();
    } catch (ex) {
      setActionNotice({ kind: 'error', text: ex.message });
    }
  }

  async function handleCopy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // fallback
    }
  }

  async function toggleLock(u) {
    setActionNotice(null);
    try {
      await api('users.setLock', { id: u.id, locked: !u.isLocked });
      setActionNotice({
        kind: 'success',
        text: `User ${u.email} has been ${u.isLocked ? 'unlocked and restored' : 'locked and suspended'}.`
      });
      reload();
    } catch (ex) {
      setActionNotice({ kind: 'error', text: ex.message });
    }
  }

  async function saveUserEdit(e) {
    e.preventDefault();
    setEditBusy(true);
    setEditErr('');
    try {
      await api('users.update', { id: editUser.id, ...editForm });
      setEditUser(null);
      setActionNotice({ kind: 'success', text: `User ${editForm.email} updated successfully.` });
      reload();
    } catch (ex) {
      setEditErr(ex.message);
    }
    setEditBusy(false);
  }

  async function savePasswordReset(e) {
    e.preventDefault();
    setPwdBusy(true);
    setPwdErr('');
    try {
      await api('users.resetPassword', { id: pwdUser.id, password: newPassword });
      setPwdUser(null);
      setNewPassword('');
      setActionNotice({ kind: 'success', text: `Password for ${pwdUser.email} has been successfully reset.` });
      reload();
    } catch (ex) {
      setPwdErr(ex.message);
    }
    setPwdBusy(false);
  }

  async function handleDeleteUser(u) {
    setActionNotice(null);
    try {
      await api('users.delete', { id: u.id });
      setActionNotice({ kind: 'success', text: `User ${u.email} and all their content have been deleted.` });
      reload();
    } catch (ex) {
      setActionNotice({ kind: 'error', text: ex.message });
    }
  }

  return (
    <>
      <div className="head" style={{ marginBottom: 4 }}>
        <div>
          <h1>Super Admin Portal</h1>
          <p className="muted" style={{ margin: 0 }}>
            Platform governance, existing user management, and invite-only link controls.
          </p>
        </div>
      </div>

      <Stats items={statsItems} />

      {actionNotice && <Notice kind={actionNotice.kind}>{actionNotice.text}</Notice>}

      {/* Tabs */}
      <div className="super-tabs">
        <button
          className={`super-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setTab('users')}
        >
          <span>Users Management</span>
          <span className="super-badge">{users.length}</span>
        </button>
        <button
          className={`super-tab-btn ${activeTab === 'invites' ? 'active' : ''}`}
          onClick={() => setTab('invites')}
        >
          <span>Invite Links & Access</span>
          <span className="super-badge">{activeCodesCount}</span>
        </button>
      </div>

      {/* TAB 1: USERS MANAGEMENT */}
      {activeTab === 'users' && (
        <section className="card">
          <div className="table-filter-bar">
            <div className="grow" style={{ maxWidth: 360 }}>
              <input
                type="search"
                placeholder="Search by name, email, or slug…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div style={{ width: 170 }}>
              <select value={filterRole} onChange={e => setFilterRole(e.target.value)}>
                <option value="all">All Users ({users.length})</option>
                <option value="active">Active Only ({users.length - lockedUsersCount})</option>
                <option value="locked">Locked Only ({lockedUsersCount})</option>
                <option value="admin">Super Admins ({users.filter(u => u.isAdmin).length})</option>
              </select>
            </div>
            <button className="btn small" onClick={() => reload()}>
              Refresh
            </button>
          </div>

          <table className="data">
            <thead>
              <tr>
                <th>User</th>
                <th>Slug & Links</th>
                <th>Joined</th>
                <th>Invited via</th>
                <th>Role</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!filteredUsers.length && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)' }}>
                    No users match your search criteria.
                  </td>
                </tr>
              )}
              {filteredUsers.map(u => {
                const isSelf = u.id === user.id;
                const initials = (u.name || u.email || 'U').slice(0, 2).toUpperCase();

                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="user-avatar">{initials}</div>
                        <div>
                          <strong style={{ display: 'block', color: 'var(--text)' }}>
                            {u.name || '(No name set)'}
                            {isSelf && <small style={{ color: 'var(--primary)', marginLeft: 6 }}>(You)</small>}
                          </strong>
                          <span style={{ fontSize: '.82rem', color: 'var(--muted)' }}>{u.email}</span>
                        </div>
                      </div>
                    </td>

                    <td>
                      {u.slug ? (
                        <div style={{ display: 'grid', gap: 2 }}>
                          <code>{u.slug}</code>
                          <div style={{ display: 'flex', gap: 6, fontSize: '.78rem' }}>
                            <a href={`/p/${u.slug}/chat`} target="_blank" rel="noreferrer" title="Chat with persona">
                              Chat ↗
                            </a>
                            <span>•</span>
                            <a href={`/p/${u.slug}`} target="_blank" rel="noreferrer" title="View public profile">
                              Profile ↗
                            </a>
                          </div>
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>

                    <td style={{ fontSize: '.85rem' }}>{fmtDate(u.created_at)}</td>

                    <td>
                      {u.invite_code ? (
                        <div style={{ fontSize: '.85rem' }}>
                          <code>{fmt(u.invite_code)}</code>
                          {u.invite_label && <small style={{ display: 'block', color: 'var(--muted)' }}>{u.invite_label}</small>}
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: '.85rem' }}>Direct / Founder</span>
                      )}
                    </td>

                    <td>
                      <span className={`pill ${u.isAdmin ? 'published' : 'draft'}`}>
                        {u.isAdmin ? 'Super Admin' : 'Member'}
                      </span>
                    </td>

                    <td>
                      <span className={`pill ${u.isLocked ? 'revoked' : 'active'}`}>
                        {u.isLocked ? 'Locked' : 'Active'}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div className="action-btn-group" style={{ justifyContent: 'flex-end' }}>
                        <button
                          className="btn small"
                          title="Edit user details"
                          onClick={() => {
                            setEditUser(u);
                            setEditForm({ name: u.name || '', email: u.email || '', slug: u.slug || '' });
                            setEditErr('');
                          }}
                        >
                          Edit
                        </button>

                        <button
                          className="btn small"
                          title="Reset user password"
                          onClick={() => {
                            setPwdUser(u);
                            setNewPassword('');
                            setPwdErr('');
                          }}
                        >
                          Password
                        </button>

                        <button
                          className={`btn small ${u.isLocked ? 'primary' : ''}`}
                          title={isSelf ? 'Cannot lock your own account' : u.isLocked ? 'Unlock account' : 'Suspend account'}
                          disabled={isSelf}
                          onClick={() => toggleLock(u)}
                        >
                          {u.isLocked ? 'Unlock' : 'Lock'}
                        </button>

                        {!isSelf && (
                          <Confirm
                            label="Delete"
                            warn={`Permanently delete ${u.email} and all their files, topics, and profile? This action is irreversible.`}
                            confirmLabel="Yes, delete user"
                            onConfirm={() => handleDeleteUser(u)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* TAB 2: INVITE LINKS */}
      {activeTab === 'invites' && (
        <>
          <section className="card">
            <h3>Create New Invite Link</h3>
            <p className="muted" style={{ fontSize: '.9rem', margin: '0 0 16px' }}>
              Create an invite link to onboard a new creator or team member. Send this link directly to them so they can register and launch their studio.
            </p>

            <form onSubmit={handleCreateInvite}>
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <div className="grow">
                  <Field label="Recipient / Note (e.g. Dr. Maya Patel, Partner)">
                    <input
                      type="text"
                      placeholder="e.g. Alex Chen - AI Researcher"
                      value={label}
                      onChange={e => setLabel(e.target.value)}
                    />
                  </Field>
                </div>
                <div style={{ width: 110 }}>
                  <Field label="Max uses">
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={uses}
                      onChange={e => setUses(+e.target.value)}
                    />
                  </Field>
                </div>
                <div style={{ width: 180 }}>
                  <Field label="Expires in (days, 0 = never)">
                    <input
                      type="number"
                      min={0}
                      max={365}
                      value={days}
                      onChange={e => setDays(+e.target.value)}
                    />
                  </Field>
                </div>
                <button type="submit" className="btn primary" style={{ marginBottom: 12 }}>
                  Create Invite Link
                </button>
              </div>
            </form>

            {createdCode && (
              <div className="invite-banner">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                  <strong style={{ color: '#9be8d6', fontSize: '1.05rem' }}>
                    ✓ Invite Link Created Successfully
                  </strong>
                  <button
                    className="btn primary small"
                    onClick={() => handleCopy(`${window.location.origin}/invite/${createdCode}`)}
                  >
                    {copied ? '✓ Copied to clipboard!' : 'Copy Direct Link'}
                  </button>
                </div>
                <p style={{ margin: '4px 0 10px', fontSize: '.9rem', color: 'var(--text)' }}>
                  Send this link to the recipient. When they open it, they can register and immediately operate their studio:
                </p>
                <div style={{ display: 'grid', gap: 6, background: 'rgba(0,0,0,.3)', padding: 12, borderRadius: 10 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: 'var(--muted)', fontSize: '.8rem', width: 70 }}>Link:</span>
                    <code style={{ fontSize: '.9rem', color: '#fff' }}>
                      {`${window.location.origin}/invite/${createdCode}`}
                    </code>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: 'var(--muted)', fontSize: '.8rem', width: 70 }}>Code:</span>
                    <code style={{ fontSize: '.9rem', color: '#fff' }}>
                      {fmt(createdCode)}
                    </code>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="card">
            <div className="head">
              <h3>All Invite Links ({codes.length})</h3>
              <button className="btn small" onClick={() => reload()}>Refresh</button>
            </div>

            {!codes.length && <p className="muted">No invite codes generated yet.</p>}

            {codes.length > 0 && (
              <table className="data">
                <thead>
                  <tr>
                    <th>Invite Code</th>
                    <th>Recipient / Note</th>
                    <th>Usage</th>
                    <th>Created</th>
                    <th>Expires</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map(c => {
                    const s = codeStatus(c);
                    const linkUrl = `${window.location.origin}/invite/${c.code}`;
                    return (
                      <tr key={c.id}>
                        <td>
                          <code>{fmt(c.code)}</code>
                        </td>
                        <td>{c.label || <span className="muted">—</span>}</td>
                        <td>
                          {c.uses} / {c.max_uses} used
                        </td>
                        <td style={{ fontSize: '.85rem' }}>{fmtDate(c.created_at)}</td>
                        <td style={{ fontSize: '.85rem' }}>
                          {c.expires_at ? fmtDate(c.expires_at) : <span className="muted">Never</span>}
                        </td>
                        <td>
                          <Pill status={s} />
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="action-btn-group" style={{ justifyContent: 'flex-end' }}>
                            <button
                              className="btn small"
                              title="Copy invite link to clipboard"
                              onClick={() => handleCopy(linkUrl)}
                            >
                              Copy Link
                            </button>
                            {s === 'active' && (
                              <button
                                className="btn small danger"
                                title="Revoke this invite"
                                onClick={async () => {
                                  await api('invites.revoke', { id: c.id });
                                  reload();
                                }}
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {/* MODAL: EDIT USER */}
      {editUser && (
        <div className="admin-modal-overlay" onClick={() => setEditUser(null)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 14px' }}>Edit User Details</h3>
            <form onSubmit={saveUserEdit}>
              <Field label="Full Name">
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="e.g. Jane Doe"
                />
              </Field>
              <Field label="Email Address">
                <input
                  type="email"
                  value={editForm.email}
                  onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                  required
                />
              </Field>
              <Field label="Portfolio slug (/p/:slug)">
                <input
                  type="text"
                  value={editForm.slug}
                  onChange={e => setEditForm({ ...editForm, slug: e.target.value })}
                  required
                />
              </Field>

              <Notice kind="error">{editErr}</Notice>

              <div className="row end" style={{ marginTop: 20 }}>
                <button type="button" className="btn" onClick={() => setEditUser(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={editBusy}>
                  {editBusy ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RESET PASSWORD */}
      {pwdUser && (
        <div className="admin-modal-overlay" onClick={() => setPwdUser(null)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px' }}>Reset User Password</h3>
            <p className="muted" style={{ fontSize: '.9rem', margin: '0 0 16px' }}>
              Set a new password for <strong>{pwdUser.email}</strong>. The user will immediately be able to sign in with this new password.
            </p>
            <form onSubmit={savePasswordReset}>
              <Field label="New Password (at least 8 characters)">
                <input
                  type="password"
                  placeholder="Enter new strong password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  autoFocus
                  required
                />
              </Field>

              <Notice kind="error">{pwdErr}</Notice>

              <div className="row end" style={{ marginTop: 20 }}>
                <button type="button" className="btn" onClick={() => setPwdUser(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={pwdBusy}>
                  {pwdBusy ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

