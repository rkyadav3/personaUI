import { useState } from 'react';
import { api } from '../lib/api.js';
import { useOp } from '../lib/hooks.js';
import { Busy, Confirm, Field, Notice, Skeleton } from '../components/Ui.jsx';
import WebsiteSetup from '../components/WebsiteSetup.jsx';
import '../styles/integrations.css';

export default function Integrations() {
  const { data, error, loading, reload } = useOp('integrations.list');
  const [name, setName] = useState(''), [origin, setOrigin] = useState(''), [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState(null), [notice, setNotice] = useState(null), [selectedId, setSelectedId] = useState('');
  async function change(input) {
    if (busy) return;
    setBusy(true); setNotice(null);
    try {
      const result = await api('integrations.change', input);
      if (result.secret) { setSecret({ id: result.integrationId, value: result.secret }); setSelectedId(result.integrationId); }
      if (input.action === 'revoke' && secret?.id === input.id) setSecret(null);
      if (input.action === 'create') { setName(''); setOrigin(''); }
      setNotice({ kind: 'success', text: input.action === 'rotate' ? 'New key created. Update the saved key in your website hosting settings.' : input.action === 'revoke' ? 'Keys removed. This website can no longer ask the chatbot questions.' : 'Website connection updated.' });
      await reload();
    } catch (failure) { setNotice({ kind: 'error', text: failure.message }); }
    finally { setBusy(false); }
  }
  return <div className="integration-page">
    <div className="head"><div><h1>Website connections</h1><p className="muted">Let visitors ask your Persona questions on your own website. Follow these four steps, or share them with the person who manages your website.</p></div><button className="btn" onClick={reload} disabled={loading || busy}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    {error && <><Notice kind="error">{error}</Notice><button className="btn" onClick={reload}>Retry</button></>}
    {!data && loading && <Skeleton label="Opening website connections…" />}
    {data && <>
      {(!data.settings.enabled || !data.settings.external_enabled) && <Notice>Your website chatbot is paused by the platform. Contact Support to ask about restoring it.</Notice>}
      <section className="card"><h2>Step 1: Add your website</h2><p>Enter the address where you want visitors to use your chatbot.</p><form onSubmit={event => { event.preventDefault(); change({ action: 'create', name, origin }); }}><fieldset disabled={busy}><div className="cols c2"><Field label="Website name"><input required maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="My company website" /></Field><Field label="Website address"><input type="url" required value={origin} onChange={event => setOrigin(event.target.value)} placeholder="https://example.com" /><span className="hint">Include https:// and www if your website uses it.</span></Field></div><button className="btn primary">{busy ? 'Adding website…' : 'Add website and create key'}</button></fieldset></form></section>
      <WebsiteSetup key={selectedId || data.integrations[0]?.id || 'empty'} sites={data.integrations} selectedId={selectedId} onSelect={setSelectedId} secret={secret} onDismiss={() => setSecret(null)} />
      <section className="card"><h2>Your websites</h2>{!data.integrations.length && <p>Your websites will appear here after you add one in Step 1.</p>}{data.integrations.map(site => <article className="integration-row" key={site.id}><div><h3>{site.name}</h3><p className="muted">{site.site_origin} · {site.enabled ? 'Available' : 'Paused'}</p>{site.keys?.map(key => <p key={key.id} className="muted"><code>{key.prefix}…</code> · {key.revoked_at ? 'Removed' : Date.parse(key.expires_at) <= Date.now() ? 'Expired' : 'Active'} · Expires {new Date(key.expires_at).toLocaleDateString()}</p>)}</div><fieldset className="row" disabled={busy}><button className="btn" onClick={() => setSelectedId(site.id)}>Use for setup</button><button className="btn" onClick={() => change({ action: 'toggle', id: site.id, enabled: !site.enabled })}>{site.enabled ? 'Pause connection' : 'Resume connection'}</button><Confirm label="Replace key" className="btn" warn="The old key stops working immediately. Save the new key in your website hosting settings and publish the website again." confirmLabel="Replace connection key" onConfirm={() => change({ action: 'rotate', id: site.id })} /><Confirm label="Remove keys" warn="This website will stop receiving chatbot answers. You can create a replacement key later." confirmLabel="Remove website keys" onConfirm={() => change({ action: 'revoke', id: site.id })} /></fieldset></article>)}</section>
      <section className="card"><h2>Chat usage this month</h2><p><strong>{data.usage?.requests || 0}</strong> of {data.settings.monthly_limit} questions used · Up to {data.settings.minute_limit} per minute</p><p className="muted">{data.usage?.platform || 0} from Persona · {data.usage?.external || 0} from connected websites · {data.usage?.failed || 0} could not be answered</p><p className="hint">Your Persona page and connected websites share this limit. A question counts once Persona starts answering it, even if the answer fails. Checking the same pending question again does not count twice.</p></section>
    </>}
    {busy && <Busy label="Updating your website connection…" />}
    <Notice kind={notice?.kind}>{notice?.text}</Notice>
  </div>;
}

