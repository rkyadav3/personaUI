import { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { readEditorDraft, saveEditorDraft, clearEditorDraft, rebaseEditorDraft, editorDraftChanged } from '../lib/editorDrafts.js';
import { api } from '../lib/api.js';
import { Loading, Notice } from '../components/Ui.jsx';
import { normalizePortfolio } from '../../shared/portfolio.js';
import ContentFields from '../components/portfolio/ContentFields.jsx';
import Contributions, { OfferingForm } from '../components/profile/Contributions.jsx';
import Updates from './Updates.jsx';
import '../styles/portfolioEditor.css';
import '../styles/customization.css';

const activityTabs = { projects: 'Projects', events: 'Events & updates', talks: 'Talks', recognition: 'Recognition', awards: 'Awards', certificates: 'Certificates', testimonials: 'Testimonials', experience: 'Experience' };
const storeTabs = { items: 'All items', products: 'Products', categories: 'Offerings & categories' };
export default function ContentManager({ store = false }) {
  const { user } = useAuth();
  const draftKey = `${user.id}:${store ? 'store' : 'activity'}`, draftSnapshot = useRef(null);
  const [params, setParams] = useSearchParams(), tabs = store ? storeTabs : activityTabs;
  const tab = Object.hasOwn(tabs, params.get('tab')) ? params.get('tab') : store ? 'items' : 'projects';
  const [saved, setSaved] = useState(null), [pf, setPf] = useState(null), [profile, setProfile] = useState(null), [message, setMessage] = useState(null), [busy, setBusy] = useState(false), [offer, setOffer] = useState(null);
  const reloadProfile = () => api('profile.get').then(setProfile, error => setMessage({ kind: 'error', text: error.message }));
  useEffect(() => { let active = true; api('site.get').then(value => { if (active) { const cached = readEditorDraft(draftKey), draft = cached ? rebaseEditorDraft(cached, value) : null; setSaved(draft?.saved || value); setPf(draft?.pf || value.portfolio); if (draft) setMessage({ kind: draft.conflicts.length ? 'error' : 'info', text: draft.conflicts.length ? 'Some records changed elsewhere. Your draft is retained; reload saved content to resolve the conflict.' : 'Your unsaved content draft was restored.' }); } }, error => { if (active) setMessage({ kind: 'error', text: error.message }); }); if (store) reloadProfile(); return () => { active = false; }; }, [store]);
  draftSnapshot.current = saved && pf ? { saved, page: saved.page, pf, bg: saved.bg } : null;
  useEffect(() => { const unload = event => { if (editorDraftChanged(draftSnapshot.current)) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', unload); return () => { window.removeEventListener('beforeunload', unload); if (editorDraftChanged(draftSnapshot.current)) saveEditorDraft(draftKey, draftSnapshot.current); else clearEditorDraft(draftKey); }; }, [draftKey]);
  const select = next => { const search = new URLSearchParams(params); search.set('tab', next); setParams(search); setOffer(null); };
  const back = params.get('return');
  const returnTo = back?.startsWith('/admin/settings') && !back.includes('\\') ? back : null;
  if (!saved || !pf) return <Loading label="Loading content…" error={message?.text} />;
  const collections = store ? ['products'] : Object.keys(activityTabs).filter(key => key !== 'events');
  const normalized = normalizePortfolio(pf);
  const dirty = collections.some(key => JSON.stringify(normalized[key]) !== JSON.stringify(saved.portfolio[key]));
  async function save() {
    setBusy(true); setMessage(null);
    try { const portfolioPatch = Object.fromEntries(collections.filter(key => JSON.stringify(normalized[key]) !== JSON.stringify(saved.portfolio[key])).map(key => [key, normalized[key]])); const next = await api('page.save', { portfolioPatch, expectedVersion: saved.version }); clearEditorDraft(draftKey); setSaved(next); setPf(next.portfolio); setMessage({ kind: 'success', text: 'Content saved. Your public pages use these same records.' }); }
    catch (error) { setMessage({ kind: 'error', text: error.message }); }
    finally { setBusy(false); }
  }
  const offerings = (profile?.contributions || []).flatMap(category => (category.offerings || []).map(item => ({ ...item, category })));
  return <div className="portfolio-editor"><div className="head"><div><h1>{store ? 'Store' : 'Activity'}</h1><p className="muted">{store ? 'Manage every item, its pricing and categories here.' : 'Manage your public work, milestones and events here.'}</p></div><div className="row">{returnTo && <Link className="btn" to={returnTo}>Return to preview</Link>}{store && <><button type="button" className="btn" disabled={busy} onClick={() => { select('products'); setPf(value => ({ ...value, products: [...value.products, { id: crypto.randomUUID(), title: '', pricing: 'free', amount: 0, currency: 'INR' }] })); }}>Add product</button><button type="button" className="btn" disabled={busy || !profile?.contributions?.length} onClick={() => { select('items'); setOffer('new'); }}>Add offering</button><button type="button" className="btn" disabled={busy} onClick={() => { const next = new URLSearchParams(params); next.set('tab', 'categories'); next.set('action', 'add'); setParams(next); }}>Add category</button></>}<Link className="btn" to={`/admin/settings?tab=${store ? 'store' : 'projects'}`}>Customize page</Link><button className="btn primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : dirty ? 'Save content' : 'Saved'}</button></div></div><Notice kind={message?.kind}>{message?.text}</Notice>{message?.kind === 'error' && <button type="button" className="btn" disabled={busy} onClick={async () => { setBusy(true); try { const next = await api('site.get'); setSaved(next); setPf(next.portfolio); setMessage({ kind: 'info', text: 'Latest saved content loaded. Your local draft was discarded.' }); } catch (error) { setMessage({ kind: 'error', text: error.message }); } finally { setBusy(false); } }}>Reload saved content and discard draft</button>}<nav className="pp-tabs" aria-label="Content categories">{Object.entries(tabs).map(([key, label]) => <button type="button" key={key} className={key === tab ? 'on' : ''} aria-current={key === tab ? 'page' : undefined} disabled={busy} onClick={() => select(key)}>{label}</button>)}</nav><fieldset className="editor-fieldset" disabled={busy}>
    {store && tab === 'items' && <><div className="card"><h3>Store catalogue</h3>{!normalized.products.length && !offerings.length && <p>No items yet. Add a product, or add a category and its offerings.</p>}{[...normalized.products.map(item => ({ ...item, kind: 'product' })), ...offerings.map(item => ({ ...item, kind: 'offering' }))].map(item => <div className="tr" key={`${item.kind}:${item.id}`}><div><b>{item.title}</b><p className="muted">{item.kind === 'product' ? 'Product' : item.category.category} · {item.pricing}{item.kind === 'offering' && (!item.active || !item.category.enabled || !item.category.visible) ? ' · Hidden' : ''}</p></div><button type="button" className="btn" onClick={() => item.kind === 'product' ? select('products') : setOffer(item)}>Edit</button></div>)}</div>{offer && <OfferingForm key={offer === 'new' ? 'new' : offer.id} contributions={profile?.contributions || []} offering={offer === 'new' ? null : offer} onDone={changed => { setOffer(null); if (changed) reloadProfile(); }} />}</>}
    {store && tab === 'categories' && (profile ? <Contributions items={profile.contributions || []} reload={reloadProfile} /> : <Loading label="Loading categories…" />)}
    {tab === 'events' ? <Updates embedded /> : <ContentFields tab={tab} pf={pf} set={patch => setPf(value => ({ ...value, ...patch }))} />}
    </fieldset></div>;
}
