import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PAGE_DEFAULTS, normalizePage } from '../../shared/pageSettings.js';
import { ICON_NAMES, PAGE_LABELS, PORTFOLIO_DEFAULTS, PUBLIC_NAV_PAGES, PRODUCT_STATUS, SOCIAL_KINDS, normalizePortfolio } from '../../shared/portfolio.js';
import { ENQUIRY_TYPES } from '../../shared/enquiryTypes.js';
import { BG_BUCKET, normalizeBg } from '../../shared/siteSettings.js';
import PortfolioSite from '../components/portfolio/PortfolioSite.jsx';
import { Field, Loading, Notice } from '../components/Ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { prepareImage } from '../lib/image.js';
import { uploadToSigned } from '../lib/storage.js';
import { CHECKOUT_CURRENCIES } from '../../shared/commerce.js';
import { LookControls, PersonaControls, StoreControls } from '../components/portfolio/PortfolioControls.jsx';
import { EDITOR_AREAS as AREAS, EDITOR_TABS as AREA_TABS, EDITOR_PREVIEW as TAB_PAGE } from '../lib/publicPageSettings.js';
import '../styles/portfolioEditor.css';
import '../styles/customization.css';
import CustomizationControls from '../components/portfolio/CustomizationControls.jsx';
import { customizationReferences } from '../../shared/customizationReferences.js';
import { customizationProblem } from '../../shared/customization.js';
import ScaledPreview from '../components/portfolio/ScaledPreview.jsx';
import { clearEditorDraft, readEditorDraft, saveEditorDraft, rebaseEditorDraft, editorDraftChanged } from '../lib/editorDrafts.js';
import { Txt, Repeater } from '../components/portfolio/EditorFields.jsx';

function Tabs({ items, active, onChange, prefix, label, controls = 'portfolio-area-panel' }) {
  const entries = Object.entries(items);
  function keydown(event, index) {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % entries.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + entries.length) % entries.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = entries.length - 1;
    else return;
    event.preventDefault(); onChange(entries[next][0]);
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus();
  }
  return <div className="pp-tabs" role="tablist" aria-label={label}>{entries.map(([key, text], index) => <button type="button" key={key} id={`${prefix}-${key}`} role="tab" aria-selected={active === key} aria-controls={controls} tabIndex={active === key ? 0 : -1} className={active === key ? 'on' : ''} onClick={() => onChange(key)} onKeyDown={event => keydown(event, index)}>{text}</button>)}</div>;
}

export function PortfolioPreviewState({ error, missing, onRetry }) {
  if (error) return <div><Notice kind="error">Could not load the preview: {error}</Notice><button type="button" className="btn" onClick={onRetry}>Retry preview</button></div>;
  if (missing) return <Notice kind="info">Create your profile to preview your public page. <Link to="/admin/profile">Create your profile</Link></Notice>;
  return <Loading compact label="Loading preview…" />;
}

export default function PortfolioEditor() {
  const { user } = useAuth();
  const draftKey = `${user.id}:appearance`, draftSnapshot = useRef(null), urls = useRef(new Set());
  const [params, setParams] = useSearchParams();
  const requestedTab = Object.hasOwn(TAB_PAGE, params.get('tab')) ? params.get('tab') : 'hero';
  const tab = ['talks', 'recognition', 'certificates', 'testimonials', 'experience'].includes(requestedTab) ? 'projects' : requestedTab === 'products' ? 'store' : requestedTab;
  const area = Object.keys(AREA_TABS).find(key => Object.hasOwn(AREA_TABS[key], tab));
  const setTab = value => { const next = new URLSearchParams(params); next.set('tab', value); setParams(next, { replace: true }); };
  const [saved, setSaved] = useState(null), [page, setPage] = useState(PAGE_DEFAULTS), [pf, setPf] = useState(PORTFOLIO_DEFAULTS), [data, setData] = useState(undefined);
  const [previewError, setPreviewError] = useState(''), [mobile, setMobile] = useState(false), [historyCount, setHistoryCount] = useState(0);
  const history = useRef([]), previous = useRef(null), skipHistory = useRef(false);
  const [bg, setBg] = useState(normalizeBg()), [pendingBg, setPendingBg] = useState(null), [removedBg, setRemovedBg] = useState(false);
  const [pending, setPending] = useState(null), [removed, setRemoved] = useState(false), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  useEffect(() => {
    const next = { page, pf, bg, pending, pendingBg, removed, removedBg };
    if (saved && previous.current && !skipHistory.current && JSON.stringify(next) !== JSON.stringify(previous.current)) { history.current = [...history.current.slice(-49), previous.current]; setHistoryCount(history.current.length); }
    skipHistory.current = false; previous.current = next;
  }, [page, pf, bg, pending, pendingBg, removed, removedBg, saved]);


  useEffect(() => {
    let active = true;
    api('site.get').then(s => { if (active) {
      const cached = readEditorDraft(draftKey), draft = cached ? rebaseEditorDraft(cached, s) : null;
      skipHistory.current = true; setSaved(draft?.saved || s); setPage(draft?.page || normalizePage(s.page)); setPf(draft?.pf || normalizePortfolio(s.portfolio)); setBg(draft?.bg || s.bg);
      if (draft) { setPending(draft.pending); setPendingBg(draft.pendingBg); setRemoved(draft.removed); setRemovedBg(draft.removedBg); for (const image of [draft.pending, draft.pendingBg]) if (image?.url) urls.current.add(image.url); setMsg({ kind: draft.conflicts.length ? 'error' : 'info', t: draft.conflicts.length ? 'The same fields changed elsewhere. Your draft is retained; reload saved settings to resolve the conflict.' : 'Your unsaved page draft was restored.' }); }
    } }, e => { if (active) setMsg({ kind: 'error', t: e.message }); });
    api('page.preview').then(value => { if (active) setData(value); }, error => { if (active) setPreviewError(error.message); });
    return () => { active = false; };
  }, []);
  draftSnapshot.current = saved ? { saved, page, pf, bg, pending, pendingBg, removed, removedBg } : null;
  useEffect(() => {
    const unload = event => { if (editorDraftChanged(draftSnapshot.current)) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('beforeunload', unload); const draft = draftSnapshot.current; if (editorDraftChanged(draft)) saveEditorDraft(draftKey, draft); else clearEditorDraft(draftKey); const retained = new Set([draft?.pending?.url, draft?.pendingBg?.url].filter(Boolean)); for (const url of urls.current) if (!retained.has(url)) URL.revokeObjectURL(url); };
  }, [draftKey]);


  if (!saved) return <Loading error={msg?.t} label="Loading page editor…" />;
  if (data === null) return <PortfolioPreviewState missing />;

  const hero = removed ? null : pending?.url || page.hero.imageUrl || (Object.hasOwn(saved, 'uploadedHeroUrl') ? saved.uploadedHeroUrl : saved.heroUrl);
  const background = removedBg ? null : pendingBg?.url || bg.imageUrl || (Object.hasOwn(saved, 'uploadedImageUrl') ? saved.uploadedImageUrl : saved.imageUrl);
  const normPf = normalizePortfolio(pf), normPage = normalizePage(page);
  const dirty = !!pending || removed || !!pendingBg || removedBg || JSON.stringify(normalizeBg(bg)) !== JSON.stringify(saved.bg) || JSON.stringify(normPf) !== JSON.stringify(saved.portfolio) || JSON.stringify(normPage) !== JSON.stringify(saved.page);
  const set = patch => setPf(p => ({ ...p, ...patch }));
  const setIn = (k, patch) => setPf(p => ({ ...p, [k]: { ...p[k], ...patch } }));
  const setPg = patch => {
    setPage(p => ({ ...p, ...patch }));
    if (Object.hasOwn(patch, 'storeTitle')) setPf(p => ({ ...p, productsTitle: patch.storeTitle }));
  };
  async function retryPreview() {
    setPreviewError('');
    try { setData(await api('page.preview')); } catch (error) { setPreviewError(error.message); }
  }

  async function choose(file) {
    if (!file) return;
    setBusy(true);
    try { const p = await prepareImage(file); const url = URL.createObjectURL(p.blob); urls.current.add(url); setPending({ ...p, url }); setRemoved(false); setPg({ hero: { zoom: 1, x: 50, y: 25, imageUrl: '' } }); setMsg(null); }
    catch (e) { setMsg({ kind: 'error', t: e.message }); }
    finally { setBusy(false); }
  }
  async function save() {
    const problem = customizationProblem(page.customization);
    if (problem) { setMsg({ kind: 'error', t: problem }); return; }
    setBusy(true); setMsg(null);
    try {
      let heroPath;
      if (pending) { const s = await api('site.sign', { type: pending.type }); await uploadToSigned(s.path, s.token, pending.blob, BG_BUCKET); heroPath = s.path; } else if (removed) heroPath = null;
      let path;
      if (pendingBg) { const s = await api('site.sign', { type: pendingBg.type }); await uploadToSigned(s.path, s.token, pendingBg.blob, BG_BUCKET); path = s.path; } else if (removedBg) path = null;
      const r = await api('page.save', { page, portfolioPatch: Object.fromEntries(Object.entries(pf).filter(([key]) => !['projects', 'products', 'experience', 'talks', 'awards', 'recognition', 'certificates', 'testimonials'].includes(key))), expectedVersion: saved.version, heroPath, bg, path });
      clearEditorDraft(draftKey); history.current = []; setHistoryCount(0); skipHistory.current = true; setSaved(r); setPage(r.page); setPf(r.portfolio); setBg(r.bg); setPending(null); setRemoved(false); setPendingBg(null); setRemovedBg(false);
      setMsg({ kind: r.warning ? 'info' : 'success', t: r.warning || 'Saved. Your portfolio, shop and persona settings are published together (visitors may need up to 30 seconds to see them).' });
    } catch (e) { setMsg({ kind: 'error', t: e.message }); }
    setBusy(false);
  }

  async function chooseBackground(file) {
    if (!file) return;
    setBusy(true);
    try { const picture = await prepareImage(file); const url = URL.createObjectURL(picture.blob); urls.current.add(url); setPendingBg({ ...picture, url }); setRemovedBg(false); setBg(b => ({ ...b, imageUrl: '', x: 50, y: 50, zoom: 1 })); setPg({ theme: { ...page.theme, bg: 'image' } }); setMsg(null); }
    catch (e) { setMsg({ kind: 'error', t: e.message }); }
    finally { setBusy(false); }
  }

  const preview = data && { ...data, page: normPage, portfolio: normPf, bgImage: background, bg: normalizeBg(bg) };
  const real = data || {};
  return (
    <div className="portfolio-editor">
      <div className="head" style={{ marginBottom: 8 }}>
        <div><h1>Public page editor</h1><p className="muted" style={{ margin: 0 }}>Customize layout, style and featured content. Manage records in Store and Activity. Preview changes before publishing.</p></div>
        <div className="row">
          <button type="button" className="btn" disabled={busy || !historyCount} onClick={() => { const last = history.current.pop(); if (!last) return; skipHistory.current = true; setPage(last.page); setPf(last.pf); setBg(last.bg); setPending(last.pending); setPendingBg(last.pendingBg); setRemoved(last.removed); setRemovedBg(last.removedBg); setHistoryCount(history.current.length); }}>Undo</button>
          {dirty && <span className="hint" role="status">Unsaved changes</span>}
          {user.slug && <a className="btn" href={`/p/${user.slug}`} target="_blank" rel="noreferrer">View live ↗</a>}
          <button className="btn primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
        </div>
      </div>
      <Notice kind={msg?.kind}>{msg?.t}</Notice>
      {msg?.kind === 'error' && <button type="button" className="btn" disabled={busy} onClick={async () => { setBusy(true); try { const next = await api('site.get'); history.current = []; setHistoryCount(0); skipHistory.current = true; setSaved(next); setPage(next.page); setPf(next.portfolio); setBg(next.bg); setPending(null); setPendingBg(null); setRemoved(false); setRemovedBg(false); setMsg({ kind: 'info', t: 'Latest saved settings loaded. The local draft was discarded.' }); } catch (error) { setMsg({ kind: 'error', t: error.message }); } finally { setBusy(false); } }}>Reload saved settings and discard draft</button>}
      <div className="portfolio-areas"><Tabs items={AREAS} active={area} prefix="portfolio-area" label="Portfolio settings" onChange={key => setTab(Object.keys(AREA_TABS[key])[0])} /></div>
      <div className="pp-editor">
        <fieldset disabled={busy} className="pp-form editor-fieldset" id="portfolio-area-panel" role="tabpanel" aria-labelledby={`portfolio-area-${area}`}>
          {Object.keys(AREA_TABS[area]).length > 1 && <Tabs items={AREA_TABS[area]} active={tab} prefix="portfolio-content" controls="portfolio-content-panel" label={`${AREAS[area]} settings`} onChange={setTab} />}
          {area === 'activity' && <p className="hint">Publish events and updates in <Link to="/admin/activity?tab=events">Events &amp; updates</Link>. All these sections appear under Activity on your public page.</p>}
          <div className="pp-content" id="portfolio-content-panel" role={Object.keys(AREA_TABS[area]).length > 1 ? 'tabpanel' : undefined} aria-labelledby={Object.keys(AREA_TABS[area]).length > 1 ? `portfolio-content-${tab}` : undefined}>
          {tab === 'look' && <LookControls page={normPage} setPage={setPg} imageUrl={background} />}
          {tab === 'store' && <><StoreControls page={{ ...normPage, storeTitle: normPf.productsTitle || normPage.storeTitle }} setPage={setPg} /><section className="card"><Txt label="Store small heading" value={pf.productsKicker} max={40} onChange={value => set({ productsKicker: value })} /><p className="hint"><Link to="/admin/store?return=%2Fadmin%2Fsettings%3Ftab%3Dstore">Manage Store items</Link></p></section></>}
          {tab === 'persona' && <PersonaControls page={page} bg={bg} setPage={setPg} setBg={patch => { if (Object.hasOwn(patch, 'imageUrl')) { setPendingBg(null); setRemovedBg(false); } setBg(b => ({ ...b, ...patch })); }} imageUrl={background} onChooseBackground={chooseBackground} onRemoveBackground={() => { setPendingBg(null); setRemovedBg(true); setBg(value => ({ ...value, imageUrl: '' })); }} />}
          {tab === 'contact' && <section className="card"><h3>Contact page</h3>
            <label className="toggle"><input type="checkbox" checked={pf.enquiry.enabled} onChange={e => setIn('enquiry', { enabled: e.target.checked })} />Accept visitor enquiries</label>
            <Txt label="Page heading" value={pf.enquiry.title} max={60} onChange={v => setIn('enquiry', { title: v })} />
            <Txt label="Introduction" value={pf.enquiry.intro} max={300} rows={3} onChange={v => setIn('enquiry', { intro: v })} />
            <Txt label="Message after submission" value={pf.enquiry.thanks} max={200} onChange={v => setIn('enquiry', { thanks: v })} />
            <p className="hint">Choose the enquiry types you accept. Leave all unchecked to accept every type. Manage public contact details in <Link to="/admin/settings?tab=privacy">Settings → Privacy</Link>.</p>
            {Object.entries(ENQUIRY_TYPES).map(([key, label]) => <label className="toggle" key={key}><input type="checkbox" checked={pf.enquiry.types.includes(key)} onChange={e => setIn('enquiry', { types: e.target.checked ? [...pf.enquiry.types, key] : pf.enquiry.types.filter(type => type !== key) })} />{label}</label>)}
          </section>}

          <CustomizationControls area={area} value={page.customization} onChange={customization => setPg({ customization })} references={customizationReferences(pf, (data?.contributions || []).flatMap(group => group.offerings || []))} />
          {tab === 'hero' && <>
            <section className="card"><h3>Photo</h3>
              <p className="hint">Choose your portrait shape below. Your photo fills the frame. Use zoom and position to adjust the crop. Without a photo, your initials are shown.</p>
              <div className="row"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => choose(e.target.files[0])} />{hero && <button className="btn" onClick={() => { setPending(null); setRemoved(true); setPg({ hero: { ...page.hero, imageUrl: '' } }); }}>Remove photo</button>}</div>
              <Txt label="Portrait image link" value={page.hero.imageUrl} ph="https://…" hint="Paste a public image URL, or choose a file above." onChange={imageUrl => { setPending(null); setRemoved(false); setPg({ hero: { ...page.hero, imageUrl } }); }} />
              {hero && <>
                {['zoom:1:3:0.05:Zoom', 'x:0:100:1:Left to right', 'y:0:100:1:Top to bottom'].map(d => { const [k, lo, hi, st, label] = d.split(':'); return <Field key={k} label={`${label} (${page.hero[k]})`}><input type="range" min={lo} max={hi} step={st} value={page.hero[k]} onChange={e => setPg({ hero: { ...page.hero, [k]: Number(e.target.value) } })} /></Field>; })}
                <Field label="Photo colour"><select value={pf.photoStyle} onChange={e => set({ photoStyle: e.target.value })}><option value="bw">Black &amp; white</option><option value="color">Original colours</option></select></Field></>}
            </section>
            <section className="card"><h3>Top of the home page</h3>
              <p className="hint">Leave a field empty to use a default made from your profile.</p>
              <div className="cols c2"><Txt label="Small greeting" value={pf.greeting} max={30} ph="Hi I’m" onChange={v => set({ greeting: v })} /><Txt label="Name shown" value={pf.heroName} max={60} ph={real.name?.split(' ')[0] || 'Your name'} onChange={v => set({ heroName: v })} /></div>
              <Txt label="Big italic line" value={pf.titleLine} max={70} ph={real.designation || 'Product & AI Builder'} onChange={v => set({ titleLine: v })} />
              <Txt label="Short intro (left of your photo)" value={pf.bio} max={320} rows={3} ph="I build AI products, intelligent systems and automation solutions that solve real-world problems." onChange={v => set({ bio: v })} />
              <Txt label="Brand text in the top bar" value={pf.brand} max={40} ph={real.name || ''} onChange={v => set({ brand: v })} />
              <label className="toggle"><input type="checkbox" checked={pf.availability.show} onChange={e => setIn('availability', { show: e.target.checked })} /> Show an availability badge</label>
              {pf.availability.show && <Txt label="Badge text" value={pf.availability.text} max={60} ph="Available for new opportunities" onChange={v => setIn('availability', { text: v })} />}
            </section>
            <section className="card"><h3>Buttons</h3>
              <p className="hint">Visitors can reach you through the Contact page in your navigation.</p>
              <div className="cols c2"><Txt label="Second button" value={pf.intro.label} max={24} ph="Watch Introduction" onChange={v => setIn('intro', { label: v })} /><Txt label="…opens (video link)" value={pf.intro.url} ph="empty = “Chat with my AI”" onChange={v => setIn('intro', { url: v })} /></div>
            </section>
            <p className="hint">Choose highlighted awards below. <Link to="/admin/activity?tab=awards&return=%2Fadmin%2Fsettings%3Ftab%3Dhero">Manage awards in Activity</Link>.</p>
            <section className="card"><h3>What I do (list right of your photo)</h3>
              <p className="hint">Empty = your expertise from Profile &amp; Offerings.</p>
              <Repeater items={pf.domains} onChange={domains => set({ domains })} blank={{ label: '', icon: '' }} max={8} noun="Item" title={d => d.label || 'New item'}>
                {(d, p) => <div className="cols c2"><Txt label="Text" value={d.label} max={40} ph="AI / Machine Learning" onChange={v => p({ label: v })} />
                  <Field label="Icon"><select value={d.icon || ''} onChange={e => p({ icon: e.target.value })}><option value="">Automatic</option>{ICON_NAMES.map(n => <option key={n} value={n}>{n}</option>)}</select></Field></div>}
              </Repeater>
            </section>
            <section className="card"><h3>Social &amp; contact links (up to 7)</h3>
              <p className="hint">Your published email is added automatically if you don’t add one.</p>
              <Repeater items={pf.socials} onChange={socials => set({ socials })} blank={{ kind: 'github', url: '' }} max={7} noun="Link" title={s => SOCIAL_KINDS[s.kind] || 'Link'}>
                {(s, p) => <div className="cols c2"><Field label="Type"><select value={s.kind} onChange={e => p({ kind: e.target.value })}>{Object.entries(SOCIAL_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                  <Txt label="Link" value={s.url} ph="https://github.com/you" onChange={v => p({ url: v })} /></div>}
              </Repeater>
            </section>
          </>}

          {tab === 'numbers' && (
            <section className="card"><h3>Numbers under your photo (up to 4)</h3>
              <p className="hint">Leave this empty and they are worked out for you (years of experience, projects, products). Add your own to replace them.</p>
              <Repeater items={pf.stats} onChange={stats => set({ stats })} blank={{ value: '', label: '' }} max={4} noun="Number" title={s => `${s.value || '…'} ${s.label}`}>
                {(s, p) => <div className="cols c2"><Txt label="Number" value={s.value} max={12} ph="10+" onChange={v => p({ value: v })} /><Txt label="Label" value={s.label} max={30} ph="Projects Built" onChange={v => p({ label: v })} /></div>}
              </Repeater>
            </section>
          )}

          {['projects', 'talks', 'recognition', 'certificates', 'testimonials', 'experience'].includes(tab) && <section className="card"><h3>Activity presentation</h3><p>Manage records in <Link to={`/admin/activity?tab=${tab}&return=${encodeURIComponent('/admin/settings?tab='+tab)}`}>Activity</Link>. Preview layout and visibility here.</p><Txt label="Projects heading" value={pf.projectsTitle} max={40} onChange={value => set({ projectsTitle: value })} /><Txt label="Projects small heading" value={pf.projectsKicker} max={30} onChange={value => set({ projectsKicker: value })} /></section>}
          {tab === 'about' && (
            <section className="card"><h3>About section on Home</h3>
              <Txt label="Page heading" value={pf.about.title} max={60} ph={`About ${real.name?.split(' ')[0] || 'me'}`} onChange={v => setIn('about', { title: v })} />
              <Txt label="Your story (blank line = new paragraph)" value={pf.about.body} max={3000} rows={9} hint={`Empty = your “purpose” from Profile & Offerings.`} onChange={v => setIn('about', { body: v })} />
              <Txt label="Extra skills (comma separated)" value={pf.about.skills} max={400} ph="Python, React, Arduino" hint="Added to your expertise from Profile & Offerings." onChange={v => setIn('about', { skills: v })} />
            </section>
          )}

          {tab === 'design' && <>
            <section className="card"><h3>Menu names</h3>
              <p className="hint">Your menu has five pages: Home, Activity, Store, Chat and Contact. Rename them here.</p>
              <div className="cols c2">{PUBLIC_NAV_PAGES.map(k => <Txt key={k} label={PAGE_LABELS[k]} value={pf.navLabels[k]} max={16} ph={PAGE_LABELS[k]} onChange={v => setIn('navLabels', { [k]: v })} />)}</div>
            </section>
            <section className="card"><h3>Footer</h3>
              <Txt label="Footer line" value={pf.footerNote} max={120} ph="Building things that matter." onChange={v => set({ footerNote: v })} />
            </section>
          </>}
          </div>
        </fieldset>

        <div className="pp-prev"><div className="head"><div className="pp-prev-label">Live preview · {PAGE_LABELS[TAB_PAGE[tab]]}</div><div className="row"><button type="button" className="btn small" aria-pressed={!mobile} onClick={() => setMobile(false)}>Desktop</button><button type="button" className="btn small" aria-pressed={mobile} onClick={() => setMobile(true)}>Mobile</button></div></div>
          {preview ? <ScaledPreview mobile={mobile}><PortfolioSite data={preview} slug={user.slug} sub={TAB_PAGE[tab]} activitySection={['talks', 'recognition', 'certificates', 'testimonials', 'experience'].includes(requestedTab) ? requestedTab : undefined} preview heroOverride={hero} /></ScaledPreview> : <PortfolioPreviewState error={previewError} onRetry={retryPreview} />}</div>
      </div>
    </div>
  );
}
