import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ACCENTS, PAGE_DEFAULTS, PLACEMENTS, SECTION_LABELS, normalizePage } from '../../shared/pageSettings.js';
import { CATEGORIES } from '../../shared/profileSchema.js';
import { BG_BUCKET } from '../../shared/siteSettings.js';
import ProfilePage from '../components/ProfilePage.jsx';
import { Field, Notice } from '../components/Ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { prepareImage } from '../lib/image.js';
import { uploadToSigned } from '../lib/storage.js';

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

export default function PublicPage() {
  const { user } = useAuth();
  const [saved, setSaved] = useState(null), [page, setPage] = useState(PAGE_DEFAULTS), [data, setData] = useState(undefined);
  const [pending, setPending] = useState(null), [removed, setRemoved] = useState(false), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);

  useEffect(() => {
    api('site.get').then(s => { setSaved(s); setPage(s.page); }, e => setMsg({ kind: 'error', t: e.message }));
    api('page.preview').then(setData, () => setData(null));
  }, []);
  useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.url); }, [pending]);

  if (!saved) return <p className="muted">{msg ? msg.t : 'Loading…'}</p>;
  if (data === null) return <Notice kind="info">Create your profile first (Profile &amp; Offerings). Your public page is built from it.</Notice>;
  const hero = removed ? null : pending?.url || saved.heroUrl;
  const dirty = !!pending || removed || JSON.stringify(normalizePage(page)) !== JSON.stringify(saved.page);
  const set = patch => setPage(p => ({ ...p, ...patch }));
  const setIn = (k, patch) => setPage(p => ({ ...p, [k]: { ...p[k], ...patch } }));
  const setChip = (i, patch) => set({ chips: page.chips.map((c, j) => j === i ? { ...c, ...patch } : c) });

  async function choose(file) {
    if (!file) return;
    try { const p = await prepareImage(file); setPending({ ...p, url: URL.createObjectURL(p.blob) }); setRemoved(false); setIn('hero', { zoom: 1, x: 50, y: 25 }); setMsg(null); }
    catch (e) { setMsg({ kind: 'error', t: e.message }); }
  }
  async function save() {
    setBusy(true); setMsg(null);
    try {
      let heroPath;
      if (pending) { const s = await api('site.sign', { type: pending.type }); await uploadToSigned(s.path, s.token, pending.blob, BG_BUCKET); heroPath = s.path; } else if (removed) heroPath = null;
      const r = await api('page.save', { page, heroPath });
      setSaved(r); setPage(r.page); setPending(null); setRemoved(false);
      setMsg({ kind: 'success', t: 'Saved. Your public page now looks like the preview (visitors may need up to 30 seconds to see it).' });
    } catch (e) { setMsg({ kind: 'error', t: e.message }); }
    setBusy(false);
  }

  const norm = normalizePage(page), preview = data && { ...data, page: norm };
  return (
    <>
      <div className="head" style={{ marginBottom: 8 }}>
        <div><h1>Public Page</h1><p className="muted" style={{ margin: 0 }}>Everything on <code>/p/{user.slug}</code> comes from your profile and offerings. Here you choose how it is laid out and worded.</p></div>
        <div className="row">
          {user.slug && <a className="btn" href={`/p/${user.slug}`} target="_blank" rel="noreferrer">View live ↗</a>}
          <button className="btn" disabled={busy} onClick={() => { setPage(PAGE_DEFAULTS); setRemoved(!!saved.heroUrl); setPending(null); }}>Reset to defaults</button>
          <button className="btn primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
        </div>
      </div>
      <Notice kind={msg?.kind}>{msg?.t}</Notice>
      <div className="pp-editor">
        <div className="pp-form">
          <section className="card"><h3>Photo</h3>
            <p className="hint">Shown beside the greeting. Without a photo, the glowing ball is shown instead.</p>
            <div className="row"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => choose(e.target.files[0])} />{hero && <button className="btn" onClick={() => { setPending(null); setRemoved(true); }}>Remove photo</button>}</div>
            {hero && ['zoom:1:3:0.05:Zoom', 'x:0:100:1:Left to right', 'y:0:100:1:Top to bottom'].map(d => { const [k, lo, hi, st, label] = d.split(':'); return <Field key={k} label={`${label} (${page.hero[k]})`}><input type="range" min={lo} max={hi} step={st} value={page.hero[k]} onChange={e => setIn('hero', { [k]: Number(e.target.value) })} /></Field>; })}
          </section>

          <section className="card"><h3>Greeting</h3>
            <p className="hint">Leave a field empty to use a sensible default made from your profile.</p>
            <div className="cols c2"><Field label="Headline"><input value={page.headline} maxLength={60} placeholder="Hi! Ask me about my" onChange={e => set({ headline: e.target.value })} /></Field>
              <Field label="Highlighted word"><input value={page.headlineAccent} maxLength={40} placeholder="work." onChange={e => set({ headlineAccent: e.target.value })} /></Field></div>
            <Field label="Subtitle"><textarea rows={2} value={page.subtitle} maxLength={220} onChange={e => set({ subtitle: e.target.value })} /></Field>
            <Field label="Search box hint"><input value={page.placeholder} maxLength={120} onChange={e => set({ placeholder: e.target.value })} /></Field>
            <h4 style={{ margin: '10px 0 6px' }}>Quick questions (buttons under the greeting)</h4>
            {page.chips.map((c, i) => (
              <div className="row" key={i} style={{ marginBottom: 6 }}>
                <input style={{ width: 150 }} value={c.label} maxLength={32} placeholder="Button text" onChange={e => setChip(i, { label: e.target.value })} />
                <input className="grow" value={c.prompt} maxLength={200} placeholder="Question it asks" onChange={e => setChip(i, { prompt: e.target.value })} />
                <button className="btn" onClick={() => set({ chips: page.chips.filter((_, j) => j !== i) })} aria-label="Remove button">✕</button>
              </div>))}
            <div className="row"><button className="btn" disabled={page.chips.length >= 6} onClick={() => set({ chips: [...page.chips, { label: '', prompt: '' }] })}>+ Add button</button>
              {page.chips.length > 0 && <button className="btn" onClick={() => set({ chips: [] })}>Use automatic buttons</button>}</div>
          </section>

          <section className="card"><h3>Profile card</h3>
            <Field label="Tagline (default: your designation)"><input value={page.tagline} maxLength={120} placeholder={data?.designation || ''} onChange={e => set({ tagline: e.target.value })} /></Field>
            <Field label="About (default: your purpose)"><textarea rows={3} value={page.about} maxLength={600} onChange={e => set({ about: e.target.value })} /></Field>
            <div className="cols c2"><Field label="First button"><input value={page.openLabel} maxLength={24} onChange={e => set({ openLabel: e.target.value })} /></Field>
              <Field label="Second button"><input value={page.talkLabel} maxLength={24} onChange={e => set({ talkLabel: e.target.value })} /></Field></div>
            <p className="hint">Name, expertise, education and experience come from <b>Profile &amp; Offerings</b>; what is hidden there stays hidden here.</p>
          </section>

          <section className="card"><h3>Store</h3>
            <div className="cols c2"><Field label="Title"><input value={page.storeTitle} maxLength={40} onChange={e => set({ storeTitle: e.target.value })} /></Field>
              <Field label="Items shown before “Show all”"><input type="number" min={2} max={40} value={page.storeLimit} onChange={e => set({ storeLimit: e.target.value })} /></Field></div>
            <Field label="Subtitle (default counts your items)"><input value={page.storeSubtitle} maxLength={140} onChange={e => set({ storeSubtitle: e.target.value })} /></Field>
            <div className="cols c2"><Field label="Currency for prices without one"><input value={page.currency} maxLength={6} onChange={e => set({ currency: e.target.value })} /></Field></div>
            <label className="toggle"><input type="checkbox" checked={page.cart} onChange={e => set({ cart: e.target.checked })} /> Let visitors add priced items to a cart</label>
          </section>

          <section className="card"><h3>Where each category appears</h3>
            <p className="hint">Store grid shows product cards. Sidebar lists them next to your profile. Categories with no offerings show as a simple row.</p>
            {CATEGORIES.map(c => <div className="row" key={c} style={{ justifyContent: 'space-between', marginBottom: 6 }}><span>{c}</span>
              <select value={page.placement[c]} onChange={e => setIn('placement', { [c]: e.target.value })}>{Object.entries(PLACEMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>)}
            <h4 style={{ margin: '12px 0 6px' }}>Sections</h4>
            <div className="row">{Object.entries(SECTION_LABELS).map(([k, v]) => <label className="toggle" key={k}><input type="checkbox" checked={page.sections[k]} onChange={e => setIn('sections', { [k]: e.target.checked })} /> {v}</label>)}</div>
          </section>

          <section className="card"><h3>Colour</h3>
            <div className="row">{Object.entries(ACCENTS).map(([k, [a, b]]) => <button key={k} className="btn" aria-pressed={page.accent === k} title={k} onClick={() => set({ accent: k })} style={{ width: 44, height: 44, padding: 0, borderRadius: '50%', background: `linear-gradient(135deg,${a},${b})`, outline: page.accent === k ? '3px solid #14122e' : 'none', outlineOffset: 2 }} />)}</div>
          </section>
        </div>

        <div className="pp-prev"><div className="pp-prev-label">Live preview</div>
          <ScaledPreview>{preview ? <ProfilePage data={preview} slug={user.slug} preview heroOverride={hero} /> : <p className="muted">Loading…</p>}</ScaledPreview></div>
      </div>
    </>
  );
}
