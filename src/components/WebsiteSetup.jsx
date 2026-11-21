import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Busy, Field, Notice } from './Ui.jsx';
import CopyValue from './CopyValue.jsx';
import { serverSetupCode } from '../lib/websiteSetup.js';
import proxySource from '../../examples/persona-proxy.js?raw';

export default function WebsiteSetup({ sites, selectedId, onSelect, secret, onDismiss }) {
  const [platform, setPlatform] = useState('vercel'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [checked, setChecked] = useState(null);
  const site = sites.find(item => item.id === selectedId) || sites[0];
  const apiUrl = `${window.location.origin}/api/persona`;
  const code = serverSetupCode(proxySource, platform);
  function download() {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const link = document.createElement('a'); link.href = url; link.download = platform === 'next' ? 'route.js' : 'persona-proxy.js'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function check() {
    if (busy) return;
    setBusy(true); setError(''); setChecked(null);
    try { setChecked(await api('integrations.status', { id: site.id })); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  if (!site) return <p>Add your website above to see the exact settings and code to copy.</p>;
  return <>
    <section className="card"><h2>Step 2: Save your website hosting settings</h2>
      <Field label="Website to set up"><select value={site.id} disabled={busy} onChange={event => { onSelect(event.target.value); setChecked(null); setError(''); }}>{sites.map(item => <option value={item.id} key={item.id}>{item.name} · {item.site_origin}</option>)}</select></Field>
      <p>Open your website hosting dashboard and find <strong>Environment variables</strong>. Add these three names and values. The connection key works like a password for your website.</p>
      {secret?.id === site.id ? <><Notice>Shown once. Save this key before leaving the page.</Notice><CopyValue label="PERSONA_API_KEY · Private connection key" value={secret.value} secret /><button className="btn" onClick={onDismiss}>I saved the key · hide it</button></> : <p>For <strong>PERSONA_API_KEY</strong>, use the key you saved when adding this website. If you lost it, use <strong>Replace key</strong> in Your websites below.</p>}
      <CopyValue label="PERSONA_API_URL · Persona address" value={apiUrl} /><CopyValue label="SITE_ORIGIN · Your website address" value={site.site_origin} />
      <p className="hint">Keep PERSONA_API_KEY in your hosting secrets. Don’t put it in page code, a public file, or a URL. It expires after 90 days; replace it before then.</p>
    </section>
    <section className="card"><h2>Step 3: Add the chatbot to your website</h2><p>You or the person who manages your website will add a small server file to keep the connection key private, then add the chatbot code to your page.</p>
      <Field label="Website platform"><select value={platform} onChange={event => setPlatform(event.target.value)}><option value="vercel">Vercel · JavaScript website</option><option value="next">Next.js · App Router</option></select></Field>
      <ol className="connection-instructions"><li>Create <code>{platform === 'next' ? 'app/api/persona-proxy/route.js' : 'api/persona-proxy.js'}</code> in your website project. Copy or download the server code into it.</li><li>Add the chatbot code below to the HTML where you want it to appear. In Next.js, load the script with your Script component using the same attributes.</li><li>Publish your website again so the code and hosting settings take effect.</li></ol>
      <details className="connection-code"><summary>Server code · {platform === 'next' ? 'route.js' : 'persona-proxy.js'}</summary><CopyValue label="Server code" value={code} code /></details><button className="btn" onClick={download}>Download server file</button>
      <CopyValue label="Chatbot code for your page" code value={`<script src="${window.location.origin}/persona-widget.js" data-endpoint="/api/persona-proxy" data-name="Ask our Persona" defer></script>`} />
      <p className="hint">Using WordPress, another website builder, or a site without server code? Share these steps and the developer details below with your website developer.</p>
    </section>
    <section className="card"><h2>Step 4: Try your chatbot</h2><p>Open your website and ask the chatbot a question. Then come back here and check whether Persona received it.</p><div className="row"><a className="btn" href={site.site_origin} target="_blank" rel="noreferrer">Open my website</a><button className="btn primary" disabled={busy} onClick={check}>{busy ? 'Checking connection…' : 'Check connection'}</button></div>
      {busy && <Busy label="Checking for a successful question…" />}<Notice kind="error">{error}</Notice>
      {checked && <Notice kind={checked.lastRequest ? 'success' : 'info'}>{checked.lastRequest ? `Persona received a successful question for this connection on ${new Date(checked.lastRequest).toLocaleString()}. Check that the answer also appears on your website.` : 'No successful question received for this connection yet. Check the three hosting settings, server file, and page code, publish the website again, then try a question.'}</Notice>}
      <p>Not getting an answer? Make sure your <Link to="/admin/profile">profile is visible to visitors</Link> and add information in <Link to="/admin/knowledge">AI knowledge</Link>.</p>
    </section>
    <details className="connection-details"><summary>Connection details for your website developer</summary><p>Persona stores the chatbot’s information. You don’t need a database name, database password, or webhook to connect your website.</p><CopyValue label="Persona API address" value={apiUrl} /><CopyValue label="Example request" code value={`POST ${apiUrl}\nAuthorization: Bearer <PERSONA_API_KEY>\nContent-Type: application/json\n\n{"op":"chat","message":"What do you offer?","requestId":"a-new-unique-id"}`} /><p>Successful responses include reply, sources and requestId. Retry a pending or undelivered request with the same ID and message. A new question needs a new ID. The browser calls your server; only your server sends the private key to Persona. API requests are counted as connected-website traffic and tied to their key. That identifies the connection, and does not prove which browser or person sent it. Add your own visitor access rules and bot protection where needed.</p><Link to="/admin/settings?tab=account">See account details</Link></details>
  </>;
}
