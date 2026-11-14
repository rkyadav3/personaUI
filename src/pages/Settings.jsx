import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PortfolioEditor from './PortfolioEditor.jsx';
import { SharedPaymentSettings } from './Purchases.jsx';
import VisibilityEditor from '../components/profile/VisibilityEditor.jsx';
import { Loading, Notice } from '../components/Ui.jsx';
import { api } from '../lib/api.js';
import { useOp } from '../lib/hooks.js';
import { readSettingsTab } from '../lib/publicPageSettings.js';
import AccountSettings from '../components/AccountSettings.jsx';

export function PrivacyPreferences({ value, onChange, onSave, busy, message }) {
  return <section className="card">
    <h3>Public profile visibility</h3>
    <p className="muted">Choose what visitors can see on your public pages and use when chatting with your persona. Contact fields stay private unless you enable them.</p>
    <VisibilityEditor value={value} onChange={onChange} />
    <button type="button" className="btn primary" disabled={busy} onClick={onSave}>{busy ? 'Saving…' : 'Save visibility'}</button>
    <Notice kind={message?.kind}>{message?.text}</Notice>
  </section>;
}

function PrivacySettings() {
  const { data, error, setData } = useOp('profile.get');
  const [visibility, setVisibility] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState(null);
  if (!data) return <Loading error={error} label="Loading privacy settings…" />;
  if (!data.profile) return <Notice kind="info">Create your profile before choosing its visibility. <Link to="/admin/profile">Create your profile</Link></Notice>;
  async function save() {
    setBusy(true); setMessage(null);
    try {
      const next = visibility || data.profile.visibility;
      await api('profile.visibility', { visibility: next });
      setData({ ...data, profile: { ...data.profile, visibility: next } }); setVisibility(null);
      setMessage({ kind: 'success', text: 'Visibility preferences saved.' });
    } catch (failure) { setMessage({ kind: 'error', text: failure.message }); }
    finally { setBusy(false); }
  }
  return <PrivacyPreferences value={visibility || data.profile.visibility} onChange={setVisibility} onSave={save} busy={busy} message={message} />;
}

export default function Settings() {
  const [params] = useSearchParams();
  const tab = readSettingsTab(params.get('tab'));
  if (tab === 'account') return <AccountSettings />;
  if (tab !== 'privacy' && tab !== 'payments') return <PortfolioEditor />;
  return <>
    <div className="head"><div><h1>{tab === 'privacy' ? 'Privacy settings' : 'Payment settings'}</h1><p className="muted">Manage {tab === 'privacy' ? 'the information you share with profile visitors' : 'paid checkout for your public Store'}.</p></div></div>
    {tab === 'privacy' ? <PrivacySettings /> : <SharedPaymentSettings />}
  </>;
}
