import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PAGE_DEFAULTS, normalizePage } from '../../shared/pageSettings.js';
import { ICON_NAMES, PAGE_LABELS, PORTFOLIO_DEFAULTS, PORTFOLIO_PAGES, PRODUCT_STATUS, SOCIAL_KINDS, normalizePortfolio } from '../../shared/portfolio.js';
import { BG_BUCKET, normalizeBg } from '../../shared/siteSettings.js';
import PortfolioSite from '../components/portfolio/PortfolioSite.jsx';
import { Field, Notice } from '../components/Ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { prepareImage } from '../lib/image.js';
import { uploadToSigned } from '../lib/storage.js';
import { CHECKOUT_CURRENCIES } from '../../shared/commerce.js';
import { LookControls, PersonaControls, StoreControls } from '../components/portfolio/PortfolioControls.jsx';
import '../styles/portfolioEditor.css';

const W = 1320;   // the page is drawn at this width and scaled down into the preview column

function ScaledPreview({ children }) {
  const box = useRef(null), inner = useRef(null), [k, setK] = useState(0.5), [h, setH] = useState(600);
  useLayoutEffect(() => {
    const fit = () => { if (box.current) setK(Math.min(1, box.current.clientWidth / W)); if (inner.current) setH(inner.current.scrollHeight); };
    fit(); const ro = new ResizeObserver(fit); ro.observe(box.current); ro.observe(inner.current); return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="pp-prev-box" style={{ height: h * k }}>
      <div ref={inner} style={{ width: W, transform: `scale(${k})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  );
}

/** One labelled text input or textarea. */
const Txt = ({ label, value, onChange, max, ph, rows, hint }) => (
  <Field label={label}>
    {rows
      ? <textarea rows={rows} value={value || ''} maxLength={max} placeholder={ph} onChange={e => onChange(e.target.value)} />
      : <input value={value || ''} maxLength={max} placeholder={ph} onChange={e => onChange(e.target.value)} />}
    {hint && <span className="hint">{hint}</span>}
  </Field>
);

/** A list of cards the owner can add to, remove from and re-order. `children(item, patch)` draws the fields of one card. */
function Repeater({ items, onChange, blank, max, noun, title, children }) {
  const patch = (i, p) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i, d) => { const a = [...items], j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange(a); };
  return (
    <>
      {items.map((it, i) => (
        <div className="card inner" key={i}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <b>{title ? title(it, i) : `${noun} ${i + 1}`}</b>
            <span className="row">
              <button type="button" className="btn small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
              <button type="button" className="btn small" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
              <button type="button" className="btn small danger" onClick={() => onChange(items.filter((_, j) => j !== i))}>Remove</button>
            </span>
          </div>
          {children(it, p => patch(i, p), i)}
        </div>
      ))}
      <button type="button" className="btn" disabled={items.length >= max} onClick={() => onChange([...items, { ...blank }])}>+ Add {noun.toLowerCase()}</button>
      {items.length >= max && <span className="hint"> Maximum {max}.</span>}
    </>
  );
}

const CONTENT_TABS = { hero: 'Home top', numbers: 'Numbers', projects: 'Projects', products: 'Products', experience: 'Experience', talks: 'Talks', about: 'About', design: 'Navigation' };
const AREAS = { content: 'Portfolio content', look: 'Look & Store', persona: 'Persona settings' };
const TAB_PAGE = { hero: 'home', numbers: 'home', projects: 'work', products: 'products', experience: 'experience', talks: 'talks', about: 'about', design: 'home', look: 'home', store: 'products', persona: 'chat' };

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

export default function PortfolioEditor() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = Object.hasOwn(TAB_PAGE, params.get('tab')) ? params.get('tab') : 'hero';
  const area = tab === 'persona' ? 'persona' : ['look', 'store'].includes(tab) ? 'look' : 'content';
  const setTab = value => { const next = new URLSearchParams(params); next.set('tab', value); setParams(next, { replace: true }); };
  const [saved, setSaved] = useState(null), [page, setPage] = useState(PAGE_DEFAULTS), [pf, setPf] = useState(PORTFOLIO_DEFAULTS), [data, setData] = useState(undefined);
  const [bg, setBg] = useState(normalizeBg()), [pendingBg, setPendingBg] = useState(null), [removedBg, setRemovedBg] = useState(false);
  const [pending, setPending] = useState(null), [removed, setRemoved] = useState(false), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);

  useEffect(() => {
    api('site.get').then(s => { setSaved(s); setPage(s.page); setPf(s.portfolio); setBg(s.bg); }, e => setMsg({ kind: 'error', t: e.message }));
    api('page.preview').then(setData, () => setData(null));
  }, []);
  useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.url); }, [pending]);
  useEffect(() => () => { if (pendingBg) URL.revokeObjectURL(pendingBg.url); }, [pendingBg]);

  if (!saved) return <p className="muted">{msg ? msg.t : 'Loading…'}</p>;
  if (data === null) return <Notice kind="info">Create your profile first (Profile &amp; Offerings). Your pages are built from it.</Notice>;

  const hero = removed ? null : pending?.url || saved.heroUrl;
  const background = removedBg ? null : pendingBg?.url || saved.imageUrl;
  const normPf = normalizePortfolio(pf), normPage = normalizePage(page);
  const dirty = !!pending || removed || !!pendingBg || removedBg || JSON.stringify(normalizeBg(bg)) !== JSON.stringify(saved.bg) || JSON.stringify(normPf) !== JSON.stringify(saved.portfolio) || JSON.stringify(normPage) !== JSON.stringify(saved.page);
  const set = patch => setPf(p => ({ ...p, ...patch }));
  const setIn = (k, patch) => setPf(p => ({ ...p, [k]: { ...p[k], ...patch } }));
  const setPg = patch => {
    setPage(p => ({ ...p, ...patch }));
    if (Object.hasOwn(patch, 'storeTitle')) setPf(p => ({ ...p, productsTitle: patch.storeTitle }));
  };

  async function choose(file) {
    if (!file) return;
    try { const p = await prepareImage(file); setPending({ ...p, url: URL.createObjectURL(p.blob) }); setRemoved(false); setPg({ hero: { zoom: 1, x: 50, y: 25 } }); setMsg(null); }
    catch (e) { setMsg({ kind: 'error', t: e.message }); }
  }
  async function save() {
    setBusy(true); setMsg(null);
    try {
      let heroPath;
      if (pending) { const s = await api('site.sign', { type: pending.type }); await uploadToSigned(s.path, s.token, pending.blob, BG_BUCKET); heroPath = s.path; } else if (removed) heroPath = null;
      let path;
      if (pendingBg) { const s = await api('site.sign', { type: pendingBg.type }); await uploadToSigned(s.path, s.token, pendingBg.blob, BG_BUCKET); path = s.path; } else if (removedBg) path = null;
      const r = await api('page.save', { page, portfolio: pf, heroPath, bg, path });
      setSaved(r); setPage(r.page); setPf(r.portfolio); setBg(r.bg); setPending(null); setRemoved(false); setPendingBg(null); setRemovedBg(false);
      setMsg({ kind: r.warning ? 'info' : 'success', t: r.warning || 'Saved. Your portfolio, shop and persona settings are published together (visitors may need up to 30 seconds to see them).' });
    } catch (e) { setMsg({ kind: 'error', t: e.message }); }
    setBusy(false);
  }

  async function chooseBackground(file) {
    if (!file) return;
    try { const picture = await prepareImage(file); setPendingBg({ ...picture, url: URL.createObjectURL(picture.blob) }); setRemovedBg(false); setBg(b => ({ ...b, x: 50, y: 50, zoom: 1 })); setPg({ theme: { ...page.theme, bg: 'image' } }); setMsg(null); }
    catch (e) { setMsg({ kind: 'error', t: e.message }); }
  }

  const preview = data && { ...data, page: normPage, portfolio: normPf, bgImage: background, bg: normalizeBg(bg) };
  const real = data || {};
  return (
    <div className="portfolio-editor">
      <div className="head" style={{ marginBottom: 8 }}>
        <div><h1>Portfolio studio</h1><p className="muted" style={{ margin: 0 }}>One public profile at <code>/p/{user.slug}</code> with your work, shop and Chat. Edit the content, appearance and persona here.</p></div>
        <div className="row">
          {user.slug && <a className="btn" href={`/p/${user.slug}`} target="_blank" rel="noreferrer">View live ↗</a>}
          <button className="btn primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
        </div>
      </div>
      <Notice kind={msg?.kind}>{msg?.t}</Notice>
      <div className="portfolio-areas"><Tabs items={AREAS} active={area} prefix="portfolio-area" label="Portfolio settings" onChange={key => setTab(key === 'content' ? 'hero' : key)} /></div>
      <div className="pp-editor">
        <div className="pp-form" id="portfolio-area-panel" role="tabpanel" aria-labelledby={`portfolio-area-${area}`}>
          {area === 'content' && <Tabs items={CONTENT_TABS} active={tab} prefix="portfolio-content" controls="portfolio-content-panel" label="Portfolio content pages" onChange={setTab} />}
          {area === 'look' && <Tabs items={{ look: 'Look', store: 'Store & sections' }} active={tab} prefix="portfolio-content" controls="portfolio-content-panel" label="Look and Store" onChange={setTab} />}
          <div className="pp-content" id="portfolio-content-panel" role={area !== 'persona' ? 'tabpanel' : undefined} aria-labelledby={area !== 'persona' ? `portfolio-content-${tab}` : undefined}>
          {tab === 'look' && <LookControls page={normPage} setPage={setPg} imageUrl={background} />}
          {tab === 'store' && <StoreControls page={{ ...normPage, storeTitle: normPf.productsTitle || normPage.storeTitle }} setPage={setPg} />}
          {tab === 'persona' && <PersonaControls page={page} bg={bg} setPage={setPg} setBg={patch => setBg(b => ({ ...b, ...patch }))} imageUrl={background} onChooseBackground={chooseBackground} onRemoveBackground={() => { setPendingBg(null); setRemovedBg(true); }} />}

          {tab === 'hero' && <>
            <section className="card"><h3>Photo</h3>
              <p className="hint">Your photo fills the circle. Use zoom and position to adjust the crop. Without a photo, your initials are shown.</p>
              <div className="row"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => choose(e.target.files[0])} />{hero && <button className="btn" onClick={() => { setPending(null); setRemoved(true); }}>Remove photo</button>}</div>
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
              <div className="cols c2"><Txt label="Top-bar button" value={pf.navCta.label} max={24} ph="Let’s Connect" onChange={v => setIn('navCta', { label: v })} /><Txt label="…opens (link)" value={pf.navCta.url} ph="default: your email" onChange={v => setIn('navCta', { url: v })} /></div>
              <div className="cols c2"><Txt label="Main button" value={pf.cta.label} max={24} ph="Work with me" onChange={v => setIn('cta', { label: v })} /><Txt label="…opens (link)" value={pf.cta.url} ph="default: your email" onChange={v => setIn('cta', { url: v })} /></div>
              <div className="cols c2"><Txt label="Second button" value={pf.intro.label} max={24} ph="Watch Introduction" onChange={v => setIn('intro', { label: v })} /><Txt label="…opens (video link)" value={pf.intro.url} ph="empty = “Chat with my AI”" onChange={v => setIn('intro', { url: v })} /></div>
            </section>
            <section className="card"><h3>Awards &amp; recognition (up to 3)</h3>
              <Repeater items={pf.awards} onChange={awards => set({ awards })} blank={{ title: '', sub: '' }} max={3} noun="Award" title={a => a.title || a.sub || 'New award'}>
                {(a, p) => <div className="cols c2"><Txt label="Small line" value={a.title} max={50} ph="IIT Project Expo 3.0" onChange={v => p({ title: v })} /><Txt label="Main line" value={a.sub} max={60} ph="3rd Prize — VisionSwitch" onChange={v => p({ sub: v })} /></div>}
              </Repeater>
            </section>
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

          {tab === 'projects' && <>
            <section className="card"><h3>Projects section</h3>
              <p className="hint">Appears on your home page and as the Work page once you add a project with a title.</p>
              <div className="cols c2"><Txt label="Small heading" value={pf.projectsKicker} max={30} ph="Featured work" onChange={v => set({ projectsKicker: v })} /><Txt label="Heading" value={pf.projectsTitle} max={40} ph="Selected Projects" onChange={v => set({ projectsTitle: v })} /></div>
            </section>
            <section className="card"><h3>Projects</h3>
              <Repeater items={pf.projects} onChange={projects => set({ projects })} blank={{ title: '' }} max={24} noun="Project" title={x => x.title || 'New project'}>
                {(x, p) => <>
                  <Txt label="Title" value={x.title} max={80} ph="VisionSwitch" onChange={v => p({ title: v })} />
                  <div className="cols c2"><Txt label="Category tag" value={x.tag} max={40} ph="IoT + Computer Vision" onChange={v => p({ tag: v })} /><Txt label="Year" value={x.year} max={10} ph="2025" onChange={v => p({ year: v })} /></div>
                  <Txt label="One-line summary" value={x.summary} max={240} rows={2} onChange={v => p({ summary: v })} />
                  <Txt label="Full description (opens in a pop-up; blank line = new paragraph)" value={x.description} max={1600} rows={4} onChange={v => p({ description: v })} />
                  <Txt label="Picture link (https://…)" value={x.image} ph="https://…/screenshot.png" onChange={v => p({ image: v })} />
                  <Txt label="Technologies (comma separated)" value={x.tech} max={160} ph="React, Arduino, OpenCV" onChange={v => p({ tech: v })} />
                  <div className="cols c2"><Txt label="Award line" value={x.award} max={60} ph="3rd Prize — PROJECT EXPO 3.0" onChange={v => p({ award: v })} /><Txt label="Award detail" value={x.awardSub} max={60} ph="Manipal University Jaipur" onChange={v => p({ awardSub: v })} /></div>
                  <div className="cols c2"><Txt label="Main link" value={x.demoUrl} ph="https://…" onChange={v => p({ demoUrl: v })} /><Txt label="Main button text" value={x.demoLabel} max={24} ph="View Project" onChange={v => p({ demoLabel: v })} /></div>
                  <div className="cols c2"><Txt label="Code link" value={x.repoUrl} ph="https://github.com/…" onChange={v => p({ repoUrl: v })} /><Txt label="Code button text" value={x.repoLabel} max={24} ph="Github" onChange={v => p({ repoLabel: v })} /></div>
                  <label className="toggle"><input type="checkbox" checked={!!x.featured} onChange={e => set({ projects: pf.projects.map(y => (y === x ? { ...y, featured: e.target.checked } : { ...y, featured: e.target.checked ? false : y.featured })) })} /> Feature this one big on the home page</label>
                </>}
              </Repeater>
            </section>
          </>}

          {tab === 'products' && <>
            <section className="card"><h3>Products section</h3>
              <p className="hint">Every visible product and offering appears in the shop on your profile home page. Manage buyers and payment setup in <Link to="/admin/purchases">Purchases</Link>.</p>
              <div className="cols c2"><Txt label="Small heading" value={pf.productsKicker} max={40} ph="Free & paid offerings" onChange={v => set({ productsKicker: v })} /><Txt label="Heading" value={pf.productsTitle} max={40} ph="Shop" onChange={v => set({ productsTitle: v })} /></div>
            </section>
            <section className="card"><h3>Products &amp; initiatives</h3>
              <Repeater items={pf.products} onChange={products => set({ products })} blank={{ id: '', title: '', pricing: 'free', amount: 0, currency: 'INR', deliveryUrl: '' }} max={24} noun="Product" title={x => x.title || 'New product'}>
                {(x, p) => <>
                  <Txt label="Name" value={x.title} max={80} ph="Attendance System" onChange={v => p({ title: v })} />
                  <Txt label="Description" value={x.summary} max={240} rows={2} ph="RFID + Face Recognition + IoT Integration" onChange={v => p({ summary: v })} />
                  <div className="cols c2"><Field label="Status"><select value={x.status || ''} onChange={e => p({ status: e.target.value })}>{PRODUCT_STATUS.map(s => <option key={s} value={s}>{s || 'None'}</option>)}</select></Field>
                    <Field label="Icon"><select value={x.icon || ''} onChange={e => p({ icon: e.target.value })}><option value="">Automatic</option>{ICON_NAMES.map(n => <option key={n} value={n}>{n}</option>)}</select></Field></div>
                  <Field label="Free or paid"><select value={x.pricing || 'unspecified'} onChange={e => p({ pricing: e.target.value, price: '' })}><option value="free">Free</option><option value="paid">Paid</option><option value="unspecified">Information only</option></select></Field>
                  {x.pricing === 'paid' && <div className="cols c2"><Field label="Price"><input type="number" min={0.01} max={9999999.99} step="0.01" value={x.amount ?? ''} onChange={e => p({ amount: e.target.value, price: '' })} /></Field>
                    <Field label="Currency"><select value={x.currency || 'INR'} onChange={e => p({ currency: e.target.value })}>{CHECKOUT_CURRENCIES.map(code => <option key={code}>{code}</option>)}</select></Field></div>}
                  {['free', 'paid'].includes(x.pricing) && <Txt label="Access / download link after checkout" value={x.deliveryUrl} max={600} ph="https://…" hint="Released to the buyer after a free claim or verified payment. Add a link to enable checkout." onChange={v => p({ deliveryUrl: v })} />}
                  <Txt label="Picture link" value={x.image} ph="https://…" onChange={v => p({ image: v })} />
                  <div className="cols c2"><Txt label="Public details link" value={x.url} ph="https://…" onChange={v => p({ url: v })} /><Txt label="Details button text" value={x.linkLabel} max={24} ph="More details" onChange={v => p({ linkLabel: v })} /></div>
                </>}
              </Repeater>
            </section>
          </>}

          {tab === 'experience' && (
            <section className="card"><h3>Experience timeline</h3>
              <p className="hint">Empty = the employers from Profile &amp; Offerings. Education always comes from there.</p>
              <Repeater items={pf.experience} onChange={experience => set({ experience })} blank={{ role: '', company: '' }} max={20} noun="Role" title={e => [e.role, e.company].filter(Boolean).join(' · ') || 'New role'}>
                {(e, p) => <>
                  <div className="cols c2"><Txt label="Role" value={e.role} max={80} ph="Founder" onChange={v => p({ role: v })} /><Txt label="Company" value={e.company} max={80} ph="Equilx Corporation" onChange={v => p({ company: v })} /></div>
                  <Txt label="Period" value={e.period} max={40} ph="2023 – Present" onChange={v => p({ period: v })} />
                  <Txt label="What you did" value={e.summary} max={500} rows={3} onChange={v => p({ summary: v })} />
                </>}
              </Repeater>
            </section>
          )}

          {tab === 'talks' && (
            <section className="card"><h3>Talks, podcasts &amp; interviews</h3>
              <p className="hint">Your “Talk Shows” offerings also appear here. The Talks page shows once there is at least one.</p>
              <Repeater items={pf.talks} onChange={talks => set({ talks })} blank={{ title: '' }} max={24} noun="Talk" title={t => t.title || 'New talk'}>
                {(t, p) => <>
                  <Txt label="Title" value={t.title} max={100} onChange={v => p({ title: v })} />
                  <div className="cols c2"><Txt label="Event or show" value={t.event} max={100} onChange={v => p({ event: v })} /><Txt label="Date" value={t.date} max={30} ph="March 2025" onChange={v => p({ date: v })} /></div>
                  <Txt label="Short note" value={t.summary} max={300} rows={2} onChange={v => p({ summary: v })} />
                  <Txt label="Link (video / article)" value={t.url} ph="https://…" onChange={v => p({ url: v })} />
                </>}
              </Repeater>
            </section>
          )}

          {tab === 'about' && (
            <section className="card"><h3>About page</h3>
              <Txt label="Page heading" value={pf.about.title} max={60} ph={`About ${real.name?.split(' ')[0] || 'me'}`} onChange={v => setIn('about', { title: v })} />
              <Txt label="Your story (blank line = new paragraph)" value={pf.about.body} max={3000} rows={9} hint={`Empty = your “purpose” from Profile & Offerings.`} onChange={v => setIn('about', { body: v })} />
              <Txt label="Extra skills (comma separated)" value={pf.about.skills} max={400} ph="Python, React, Arduino" hint="Added to your expertise from Profile & Offerings." onChange={v => setIn('about', { skills: v })} />
            </section>
          )}

          {tab === 'design' && <>
            <section className="card"><h3>Menu names</h3>
              <p className="hint">Only pages that have content appear in the menu. Rename them here.</p>
              <div className="cols c2">{PORTFOLIO_PAGES.map(k => <Txt key={k} label={PAGE_LABELS[k]} value={pf.navLabels[k]} max={16} ph={PAGE_LABELS[k]} onChange={v => setIn('navLabels', { [k]: v })} />)}</div>
            </section>
            <section className="card"><h3>Footer</h3>
              <Txt label="Footer line" value={pf.footerNote} max={120} ph="Building things that matter." onChange={v => set({ footerNote: v })} />
            </section>
          </>}
          </div>
        </div>

        <div className="pp-prev"><div className="pp-prev-label">Live preview · {PAGE_LABELS[TAB_PAGE[tab]]}</div>
          <ScaledPreview>{preview ? <PortfolioSite data={preview} slug={user.slug} sub={TAB_PAGE[tab]} preview heroOverride={hero} /> : <p className="muted">Loading…</p>}</ScaledPreview></div>
      </div>
    </div>
  );
}
