import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useOp } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { Field, Loading, Notice } from '../components/Ui.jsx';
import { HOME_DEFAULTS, HOME_TEXT_LIMITS, normalizeHomeSettings } from '../../shared/homeSettings.js';
import '../styles/governance.css';
import MainSitePreview from '../components/MainSitePreview.jsx';

const labels = { siteName: 'Site name', eyebrow: 'Intro label', headline: 'Headline opening', highlight: 'Highlighted words', headlineEnd: 'Headline ending', subtitle: 'Intro description', searchPlaceholder: 'Search placeholder', profilesTitle: 'Profiles section title', profilesDescription: 'Profiles section description', productsTitle: 'Products section title', footer: 'Footer text' };
export default function MainSiteSettings() {
  const { user } = useAuth();
  return user?.isSuperAdmin ? <SettingsLoader /> : <Notice kind="error">Only the SuperAdmin can edit the main site.</Notice>;
}
function SettingsLoader() {
  const { data, error } = useOp('platform.home.get');
  return data ? <MainSiteEditor initial={data.settings} /> : <Loading error={error} label="Loading main site settings…" />;
}
export function MainSiteEditor({ initial }) {
  const revision = useRef(0);
  const [form, setForm] = useState(() => normalizeHomeSettings(initial)), [busy, setBusy] = useState(false), [notice, setNotice] = useState(null);
  const change = (key, value) => { revision.current++; setForm(current => ({ ...current, [key]: value })); setNotice(null); };
  async function save(event) {
    event.preventDefault(); setBusy(true); setNotice(null);
    const submittedRevision = revision.current;
    try {
      const result = await api('platform.home.save', form);
      const newerEdits = revision.current !== submittedRevision;
      if (!newerEdits) setForm(normalizeHomeSettings(result.settings));
      setNotice({ kind: 'success', text: newerEdits ? 'Submitted settings saved. Your newer edits are still in the preview; save again to publish them.' : 'Main site settings saved. The public directory now uses these settings.' });
    }
    catch (error) { setNotice({ kind: 'error', text: error.message }); }
    finally { setBusy(false); }
  }
  return <><div className="head"><div><span className="governance-eyebrow">PUBLIC DIRECTORY</span><h1>Main site settings</h1><p className="muted">Edit the homepage where all public admin profiles appear.</p></div><Link className="btn" to="/" target="_blank" rel="noreferrer">View main site ↗</Link></div>{notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
    <form onSubmit={save}><div className="governance-settings-grid"><section className="card"><h2>Brand & homepage content</h2>{Object.entries(labels).map(([key, label]) => <Field label={label} key={key}>{['subtitle', 'profilesDescription'].includes(key) ? <textarea rows={3} maxLength={HOME_TEXT_LIMITS[key]} value={form[key]} onChange={event => change(key, event.target.value)} /> : <input type="text" maxLength={HOME_TEXT_LIMITS[key]} value={form[key]} placeholder={key === 'siteName' ? 'Use configured site name' : ['profilesTitle', 'profilesDescription'].includes(key) ? 'Use automatic content' : ''} onChange={event => change(key, event.target.value)} />}</Field>)}<p className="muted">A blank profiles title or description uses the default directory text. A blank site name uses the configured platform name.</p></section>
      <div><section className="card"><h2>Appearance & sections</h2><div className="row"><Field label="Accent color"><input type="color" value={form.accent} onChange={event => change('accent', event.target.value)} /></Field><Field label="Page background"><input type="color" value={form.background} onChange={event => change('background', event.target.value)} /></Field></div><Field label="Default profile sorting"><select value={form.defaultSort} onChange={event => change('defaultSort', event.target.value)}><option value="rated">Top rated</option><option value="views">Most viewed</option><option value="new">Newest</option><option value="name">Name A–Z</option></select></Field><fieldset className="governance-tag-editor"><legend>Homepage sections</legend>{[['showFeatured', 'Show featured profile'], ['showProducts', 'Show products and offerings'], ['showInviteLink', 'Show join invitation link']].map(([key, label]) => <label key={key}><input type="checkbox" checked={form[key]} onChange={event => change(key, event.target.checked)} /><span>{label}</span></label>)}</fieldset></section>
</div></div><div className="row end"><button className="btn" type="button" disabled={busy} onClick={() => { setForm({ ...HOME_DEFAULTS }); setNotice(null); }}>Reset to defaults</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save main site settings'}</button></div></form><MainSitePreview settings={form} />
  </>;
}
