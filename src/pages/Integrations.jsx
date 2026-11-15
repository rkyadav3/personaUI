import { useState } from 'react';
import { api } from '../lib/api.js';
import { useOp } from '../lib/hooks.js';
import { Busy, Field, Notice, Skeleton } from '../components/Ui.jsx';
import '../styles/integrations.css';

export default function Integrations() {
  const { data, error, loading, reload } = useOp('integrations.list');
  const [name, setName] = useState(''), [origin, setOrigin] = useState(''), [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState(''), [notice, setNotice] = useState(null);
  async function change(input) {
    if (busy) return;
    setBusy(true); setNotice(null);
    try {
      const result = await api('integrations.change', input);
      if (result.secret) setSecret(result.secret);
      if (input.action === 'create') { setName(''); setOrigin(''); }
      setNotice({ kind: 'success', text: input.action === 'rotate' ? 'New key created. Previous keys were revoked.' : 'Website connection updated.' });
      await reload();
    } catch (failure) { setNotice({ kind: 'error', text: failure.message }); }
    finally { setBusy(false); }
  }
  return <div className="integration-page">
    <div className="head"><div><h1>Website connections</h1><p className="muted">Use your public Persona on your own website. Each connection has a server API key.</p></div><button className="btn" onClick={reload} disabled={loading || busy}>Refresh</button></div>
    {error && <><Notice kind="error">{error}</Notice><button className="btn" onClick={reload}>Retry</button></>}
    {!data && loading && <Skeleton label="Opening website connections…" />}
    {data && <>
      <section className="card"><h2>Usage this month</h2><p><strong>{data.usage?.requests || 0}</strong> of {data.settings.monthly_limit} admitted requests · Up to {data.settings.minute_limit} per minute</p><p className="muted">{data.usage?.platform || 0} from Persona · {data.usage?.external || 0} from connected websites · {data.usage?.failed || 0} failed</p><p className="muted">Chat on Persona and your connected websites share this monthly request limit. Accepted requests count even if the model fails; retries with the same request ID do not count again.</p>{(!data.settings.enabled || !data.settings.external_enabled) && <Notice>External chat is disabled by platform settings.</Notice>}</section>
      {secret && <section className="card" role="region" aria-label="New API key"><h2>Save your new API key</h2><p>Shown once. Store it as PERSONA_API_KEY in your website backend environment.</p><Field label="Secret API key"><input type="text" readOnly value={secret} autoComplete="off" spellCheck={false} /></Field><p className="muted">Keys expire after 90 days. Rotate the key before it expires.</p><button className="btn primary" onClick={() => setSecret('')}>I saved my key</button></section>}
      <section className="card"><h2>Add a website</h2><form onSubmit={event => { event.preventDefault(); change({ action: 'create', name, origin }); }}><fieldset disabled={busy}><div className="cols c2"><Field label="Connection name"><input required maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="Main website" /></Field><Field label="Website URL"><input type="url" required value={origin} onChange={event => setOrigin(event.target.value)} placeholder="https://example.com" /></Field></div><button className="btn primary">Create connection and key</button></fieldset></form></section>
      <section className="card"><h2>Your connections</h2>{!data.integrations.length && <p>No websites connected yet. Add your first website above.</p>}{data.integrations.map(site => <article className="integration-row" key={site.id}><div><h3>{site.name}</h3><p className="muted">{site.site_origin} · {site.enabled ? 'Enabled' : 'Disabled'}</p>{site.keys?.map(key => <p key={key.id} className="muted"><code>{key.prefix}…</code> · {key.revoked_at ? 'Revoked' : Date.parse(key.expires_at) <= Date.now() ? 'Expired' : 'Active'} · Expires {new Date(key.expires_at).toLocaleDateString()}</p>)}</div><div className="row"><button className="btn" disabled={busy} onClick={() => change({ action: 'toggle', id: site.id, enabled: !site.enabled })}>{site.enabled ? 'Disable' : 'Enable'}</button><button className="btn" disabled={busy} onClick={() => change({ action: 'rotate', id: site.id })}>Rotate key</button><button className="btn danger" disabled={busy} onClick={() => change({ action: 'revoke', id: site.id })}>Revoke keys</button></div></article>)}</section>
      <section className="card"><h2>Install on your website</h2><p>Add the backend handler first, then paste this snippet into your page:</p><pre><code>{'<script src="' + location.origin + '/persona-widget.js" data-endpoint="/api/persona-proxy" data-name="Ask our Persona" defer></script>'}</code></pre><p className="muted">The browser calls your backend. Your backend authenticates to Persona using the secret key. The website URL helps you identify a connection; request source is recorded from the authenticated server endpoint.</p><a className="btn" href="/integration-guide.md" target="_blank" rel="noreferrer">Open installation guide</a></section>
    </>}
    {busy && <Busy label="Updating your website connection…" />}
    <Notice kind={notice?.kind}>{notice?.text}</Notice>
  </div>;
}

