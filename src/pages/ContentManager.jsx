import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { readEditorDraft, saveEditorDraft, clearEditorDraft, rebaseEditorDraft, editorDraftChanged } from '../lib/editorDrafts.js';
import { api } from '../lib/api.js';
import { Loading, Notice } from '../components/Ui.jsx';
import { normalizePortfolio } from '../../shared/portfolio.js';
import ContentFields from '../components/portfolio/ContentFields.jsx';
import { UploadGroup } from '../components/MediaUpload.jsx';
import Updates from './Updates.jsx';
import '../styles/portfolioEditor.css';
import '../styles/customization.css';

const tabs = { projects: 'Projects', events: 'Events & updates', talks: 'Talks', recognition: 'Recognition', awards: 'Awards', certificates: 'Certificates', testimonials: 'Testimonials', experience: 'Experience' };
export default function ContentManager() {
  return <UploadGroup>{uploading => <ContentEditor uploading={uploading} />}</UploadGroup>;
}
function ContentEditor({ uploading }) {
  const { user } = useAuth();
  const draftKey = `${user.id}:activity`, snapshot = useRef(null);
  const [params, setParams] = useSearchParams();
  const tab = Object.hasOwn(tabs, params.get('tab')) ? params.get('tab') : 'projects';
  const [saved, setSaved] = useState(null), [pf, setPf] = useState(null), [message, setMessage] = useState(null), [saving, setBusy] = useState(false);
  const busy = saving || uploading;
  useEffect(() => {
    let active = true;
    api('site.get').then(value => {
      if (!active) return;
      const cached = readEditorDraft(draftKey), draft = cached ? rebaseEditorDraft(cached, value) : null;
      setSaved(draft?.saved || value); setPf(draft?.pf || value.portfolio);
      if (draft) setMessage({ kind: draft.conflicts.length ? 'error' : 'info', text: draft.conflicts.length ? 'Some records changed elsewhere. Your draft is retained; reload saved content to resolve the conflict.' : 'Your unsaved content draft was restored.' });
    }, error => { if (active) setMessage({ kind: 'error', text: error.message }); });
    return () => { active = false; };
  }, [draftKey]);
  snapshot.current = saved && pf ? { saved, page: saved.page, pf, bg: saved.bg } : null;
  useEffect(() => {
    const unload = event => { if (editorDraftChanged(snapshot.current)) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('beforeunload', unload); if (editorDraftChanged(snapshot.current)) saveEditorDraft(draftKey, snapshot.current); else clearEditorDraft(draftKey); };
  }, [draftKey]);
  if (!saved || !pf) return <Loading label="Loading content…" error={message?.text} />;
  const collections = Object.keys(tabs).filter(key => key !== 'events'), normalized = normalizePortfolio(pf);
  const changed = collections.filter(key => JSON.stringify(normalized[key]) !== JSON.stringify(saved.portfolio[key]));
  const back = params.get('return'), returnTo = back?.startsWith('/admin/settings') && !back.includes('\\') ? back : null;
  async function save() {
    if (busy) return;
    setBusy(true); setMessage(null);
    try {
      const portfolioPatch = Object.fromEntries(changed.map(key => [key, normalized[key]]));
      const next = await api('page.save', { portfolioPatch, expectedVersion: saved.version });
      clearEditorDraft(draftKey); setSaved(next); setPf(next.portfolio); setMessage({ kind: 'success', text: 'Content saved. Your public pages use these same records.' });
    } catch (error) { setMessage({ kind: 'error', text: error.message }); }
    finally { setBusy(false); }
  }
  async function reload() {
    setBusy(true);
    try { const next = await api('site.get'); setSaved(next); setPf(next.portfolio); setMessage({ kind: 'info', text: 'Latest saved content loaded. Your local draft was discarded.' }); }
    catch (error) { setMessage({ kind: 'error', text: error.message }); }
    finally { setBusy(false); }
  }
  return <div className="portfolio-editor" onClickCapture={event => { if (uploading && event.target.closest('a')) event.preventDefault(); }}>
    <div className="head"><div><h1>Activity</h1><p className="muted">Manage your public work, milestones and events here.</p></div><div className="row">{returnTo && <Link className="btn" to={returnTo}>Return to preview</Link>}<Link className="btn" to="/admin/settings?tab=projects">Customize page</Link><button className="btn primary" disabled={busy || !changed.length} onClick={save}>{busy ? 'Saving…' : changed.length ? 'Save content' : 'Saved'}</button></div></div>
    <Notice kind={message?.kind}>{message?.text}</Notice>
    {message?.kind === 'error' && <button type="button" className="btn" disabled={busy} onClick={reload}>Reload saved content and discard draft</button>}
    <nav className="pp-tabs" aria-label="Content categories">{Object.entries(tabs).map(([key, label]) => <button type="button" key={key} className={key === tab ? 'on' : ''} aria-current={key === tab ? 'page' : undefined} disabled={busy} onClick={() => { const search = new URLSearchParams(params); search.set('tab', key); setParams(search); }}>{label}</button>)}</nav>
    <fieldset className="editor-fieldset" disabled={busy}>{tab === 'events' ? <Updates embedded /> : <ContentFields tab={tab} pf={pf} set={patch => setPf(value => ({ ...value, ...patch }))} />}</fieldset>
  </div>;
}
