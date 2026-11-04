import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PersonaBall, { amp } from './PersonaBall.jsx';
import BackgroundLayer from './BackgroundLayer.jsx';
import LiquidGlass, { GlassProvider } from './LiquidGlass.jsx';
import { ACCENTS, FONT_STACK, normalizePage } from '../../shared/pageSettings.js';
import { fmtPrice } from '../lib/money.js';
import { resolveSite } from '../lib/portfolioModel.js';
import Shop from './commerce/Shop.jsx';
import CheckoutDialog from './commerce/CheckoutDialog.jsx';
import Events from './portfolio/Events.jsx';
import { track } from '../lib/track.js';
import '../styles/profilePage.css';

const SINGULAR = { Books: 'Book', 'Other Contributions': 'Other', 'Information & Knowledge': 'Knowledge', 'Advice & Suggestions': 'Advice', 'In-Person Discussions': 'Discussion', 'Talk Shows': 'Talk show' };
const ICON = { Books: '📖', Content: '📄', 'Information & Knowledge': 'ℹ️', 'In-Person Discussions': '👥', 'Advice & Suggestions': '💡', 'Talk Shows': '🎙️', 'Other Contributions': '✨' };
const TILE = ['#ede9fe', '#e0f2fe', '#dcfce7', '#fef3c7', '#ffe4e6', '#f1f5f9'];
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const luminance = h => { const [r, g, b] = hexRgb(h); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
const first = s => String(s || '').trim().split(/\s+/)[0];

function Stars({ avg = 0, count = 0 }) {
  return <span className="pp-stars" title={count ? `${avg} out of 5 from ${count}` : 'No ratings yet'}><span style={{ '--p': `${Math.min(100, (avg / 5) * 100)}%` }}>★★★★★</span></span>;
}
function StarInput({ mine, onRate, disabled }) {
  const [h, setH] = useState(0), shown = h || mine || 0;
  return (
    <span className="pp-starin" onMouseLeave={() => setH(0)} role="group" aria-label="Rate this">
      {[1, 2, 3, 4, 5].map(n => <button key={n} type="button" disabled={disabled} className={n <= shown ? 'on' : ''} aria-label={`${n} star${n > 1 ? 's' : ''}`} onMouseEnter={() => setH(n)} onClick={() => onRate(n)}>★</button>)}
    </span>
  );
}

function Thumb({ o, i }) {
  return o.image
    ? <img src={o.image} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; }} />
    : <span className="pp-tile" style={{ background: TILE[i % TILE.length] }} aria-hidden="true">{ICON[o.category] || '✨'}</span>;
}


export default function ProfilePage({ data, slug, user, preview = false, heroOverride }) {
  const page = useMemo(() => normalizePage(data.page), [data.page]);
  const shop = useMemo(() => resolveSite(data, slug), [data, slug]);
  const cur = page.currency, T = page.theme;
  const accent = page.accentHex ? [page.accentHex, `color-mix(in srgb, ${page.accentHex} 55%, #ffffff)`] : (ACCENTS[page.accent] || ACCENTS.violet);
  const dark = T.bg === 'color' && luminance(T.bgColor) < 0.45;      // a dark colour flips the text and glass to light-on-dark
  const rad = T.radius;
  const hero = heroOverride !== undefined ? heroOverride : data.hero;
  const name = data.name || '', me = first(name);

  // ---- offerings, split by where the owner wants them
  const side = useMemo(() => {
    const side = [];
    for (const k of data.contributions || []) {
      const where = page.placement[k.category] || 'side';
      if (where === 'hidden') continue;
      const items = k.offerings.map(o => ({ ...o, category: k.category, subtype: k.subtype, badge: k.subtype || SINGULAR[k.category] || k.category }));
      if (where !== 'store') side.push({ ...k, items });
    }
    return side;
  }, [data.contributions, page.placement]);

  // ---- smart defaults from the real profile (empty setting = use these)
  const exp = data.expertise || [];
  const subtitle = page.subtitle || `Get answers about ${exp.length ? exp.slice(0, 3).join(', ').toLowerCase() : 'my work'}, what I offer, or browse what I share.`;
  const chips = page.chips.length ? page.chips : [
    { label: 'About me', prompt: 'Tell me about yourself and your work' },
    ...(shop.products.length ? [{ label: "What's in the store?", prompt: "What's in your store?" }] : []),
    ...(data.contributions?.some(k => k.category === 'Books' && k.offerings.length) ? [{ label: 'Recommend a book', prompt: 'Which of your books should I start with?' }] : []),
    ...(exp[0] ? [{ label: 'Advice', prompt: `Can you give me advice on ${exp[0]}?` }] : []),
  ];

  // ---- chat
  const [input, setInput] = useState(''), [mode, setMode] = useState('idle'), [impulse, setImpulse] = useState(0);
  const [answer, setAnswer] = useState(''), [sources, setSources] = useState([]), [busy, setBusy] = useState(false), [listening, setListening] = useState(false);
  const inputRef = useRef(null), typer = useRef(null), recog = useRef(null);
  useEffect(() => () => clearInterval(typer.current), []);
  const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

  function speak(text, src = []) {
    clearInterval(typer.current); setAnswer(''); setSources([]); setMode('talking');
    let i = 0;
    typer.current = setInterval(() => {
      const ch = text[i++] || ''; setAnswer(text.slice(0, i)); setImpulse(amp(ch) * (0.8 + Math.random() * 0.4));
      if (i >= text.length) { clearInterval(typer.current); setMode('idle'); setBusy(false); if (src?.length) setSources(src.slice(0, 4)); }
    }, 22);
  }
  async function send(e, text) {
    e?.preventDefault();
    const q = (text ?? input).trim();
    if (!q || busy) return;
    if (preview) { setInput(''); setAnswer('Chat answers come from your uploaded notes. It is live on your public page.'); return; }
    setBusy(true); setInput(''); clearInterval(typer.current); setAnswer(''); setSources([]); setMode('thinking'); setImpulse(0.5);
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: q, slug }) });
      const d = await r.json();
      speak(d.reply || d.error || 'I could not find an answer in my notes.', d.sources);
    } catch { speak("I can't reach my notes right now. Please try again in a moment.", []); }
  }
  function mic() {
    if (!SR) return;
    if (listening) { recog.current?.stop(); return; }
    const r = new SR(); recog.current = r; r.lang = navigator.language || 'en-IN'; r.interimResults = false;
    r.onresult = ev => setInput(ev.results[0][0].transcript);
    r.onend = () => { setListening(false); setMode('idle'); inputRef.current?.focus(); };
    r.onerror = () => { setListening(false); setMode('idle'); };
    setListening(true); setMode('listening'); r.start();
  }
  const ask = o => { setOpen(null); setInput(`Tell me about "${o.title}"`); window.scrollTo?.({ top: 0, behavior: 'smooth' }); setTimeout(() => inputRef.current?.focus(), 300); };

  // ---- ratings
  const [rt, setRt] = useState({}), [note, setNote] = useState('');
  const flash = t => { setNote(t); setTimeout(() => setNote(''), 3500); };
  const view = o => ({ avg: rt[o.id]?.avg ?? o.ratingAvg, count: rt[o.id]?.count ?? o.ratingCount, mine: rt[o.id]?.mine ?? lsGet(`pp-rate:${o.id}`, 0) });
  async function rate(o, n) {
    if (preview) return flash('Ratings are live on your public page.');
    const r = await track({ kind: 'rate', id: o.id, stars: n });
    if (r?.ok) { lsSet(`pp-rate:${o.id}`, n); setRt(s => ({ ...s, [o.id]: { avg: r.avg, count: r.count, mine: n } })); flash('Thanks for rating!'); } else flash(r?.error || 'Could not save your rating.');
  }
  const click = o => { if (!preview) track({ kind: 'click', id: o.id }); };

  // ---- contact, details, filters
  const [talk, setTalk] = useState(false), [open, setOpen] = useState(null), [buying, setBuying] = useState(null);
  const openCheckout = o => { const item = shop.products.find(p => p.kind === 'offering' && String(p.id) === String(o.id)); if (item?.checkout) { setOpen(null); setBuying(item); } };
  const mail = (o, subject) => data.contact?.email ? `mailto:${data.contact.email}?subject=${encodeURIComponent(subject || `Interested in: ${o.title}`)}` : data.contact?.phone ? `tel:${data.contact.phone.replace(/[^\d+]/g, '')}` : null;
  useEffect(() => { if (!open) return undefined; const k = e => e.key === 'Escape' && setOpen(null); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open]);

  const tagline = page.tagline || data.designation, about = page.about || data.purpose;
  const sec = page.sections;

  function Offer({ o }) {   // compact offering card used in the sidebar
    const v = view(o), price = fmtPrice(o, cur);
    return (
      <div className="pp-offer">
        <div className="pp-offer-top"><h4>{o.title}</h4>{price && <span>{price}</span>}</div>
        {o.description && <p>{o.description}</p>}
        <div className="pp-offer-foot">
          <span className="pp-rate"><Stars avg={v.avg} count={v.count} /><StarInput mine={v.mine} onRate={n => rate(o, n)} /><small>{v.mine ? 'Your rating' : 'Rate this'}</small></span>
          <small>{v.count ? `${v.avg.toFixed(1)} (${v.count})` : 'No ratings yet'}</small>
        </div>
        <div className="pp-offer-act">
          {['free', 'paid'].includes(o.pricing) ? <button className="pp-btn small" disabled={o.accessReady === false && !preview} onClick={() => openCheckout(o)}>{o.pricing === 'free' ? 'Get free' : 'Buy now'}</button>
            : o.link ? <a className="pp-btn small" href={o.link} target="_blank" rel="noopener noreferrer nofollow" onClick={() => click(o)}>Open</a>
              : mail(o) && <a className="pp-btn small" href={mail(o)} onClick={() => click(o)}>Enquire</a>}
          <button className="pp-btn small ghost" onClick={() => ask(o)}>Ask about this</button>
        </div>
      </div>
    );
  }

  const o = open, ov = o ? view(o) : null;
  return (
    <GlassProvider value={{ ...page.glass, dark }}>
    <div className={`pp-page${preview ? ' is-preview' : ''}${dark ? ' pp-dark' : ''}`} style={{ '--a1': accent[0], '--a2': accent[1], '--r': `${rad}px`, '--maxw': `${T.maxWidth}px`, fontFamily: FONT_STACK[T.font], background: T.bg === 'color' ? T.bgColor : '#ffffff' }}>
      <div className="pp-bg" aria-hidden="true">
        {T.bg === 'orbs' && <><i /><i /><i /></>}
        {T.bg === 'image' && data.bgImage && <><BackgroundLayer imageUrl={data.bgImage} bg={{ ...data.bg, dim: 0, parallax: false }} /><div className="pp-wash" style={{ background: `rgba(${dark ? '10,10,20' : '255,255,255'},${T.wash / 100})` }} /></>}
      </div>
      <div className="pp-top">
        {user ? <Link className="pp-icon" to="/admin" aria-label="Dashboard">👤</Link> : null}
      </div>
      {note && <div className="pp-toast" role="status">{note}</div>}

      <main className={`pp-grid${page.layout.sidebar === 'left' ? ' side-left' : ''}`}>
        <section className="pp-main">
          <LiquidGlass className={`pp-hero photo-${page.layout.photo}`} radius={rad + 4} refract>
            <div className="pp-wave" aria-hidden="true" />
            {page.layout.photo !== 'none' && (hero || page.ball.show) && (
              <div className="pp-photo">
                {hero
                  ? <img src={hero} alt={name} style={{ objectPosition: `${page.hero.x}% ${page.hero.y}%`, transform: `scale(${page.hero.zoom})` }} />
                  : <PersonaBall mode={mode} impulse={impulse} width={page.ball.size} height={page.ball.size} dotColor={[99, 102, 241]} glowColor={[168, 85, 247]} lightTheme={!dark} />}
              </div>
            )}
            <div className="pp-hero-body">
              <h1>{page.headline || 'Hi! Ask me about my'} <em>{page.headlineAccent || 'work.'}</em></h1>
              <p>{subtitle}</p>
              <div className="pp-chips">{chips.map(c => <button key={c.label} onClick={() => { setInput(c.prompt); inputRef.current?.focus(); }}>{c.label}</button>)}</div>
              <LiquidGlass as="form" className="pp-ask" radius={999} onSubmit={send}>
                <span aria-hidden="true">✦</span>
                <input ref={inputRef} value={input} onChange={e => { setInput(e.target.value); setImpulse(0.25); }} placeholder={page.placeholder || 'Ask me anything about my work, what I offer, or my ideas…'} aria-label="Ask a question" />
                {SR && page.chat.mic && <button type="button" className={`pp-mic${listening ? ' on' : ''}`} onClick={mic} aria-label={listening ? 'Stop listening' : 'Speak your question'}>🎙️</button>}
                <button className="pp-send" disabled={busy || !input.trim()} aria-label="Send">→</button>
              </LiquidGlass>
              {(answer || busy) && <div className="pp-answer" aria-live="polite"><p>{answer || 'Searching my notes…'}</p>{page.chat.sources && sources.length > 0 && <small>Sources: {sources.join(' · ')}</small>}</div>}
            </div>
          </LiquidGlass>

          {shop.events.length > 0 && <LiquidGlass className="pp-store" id="events" radius={rad}>
            <header><div><h2>Events</h2><p>Tell {me || 'the owner'} whether you are coming.</p></div></header>
            <Events events={shop.events} slug={slug} owner={name} preview={preview} />
          </LiquidGlass>}

          {sec.store && shop.products.length > 0 && (
            <LiquidGlass className="pp-store" id="store" radius={rad} refract>
              <header><span className="pp-hex">⬡</span><div><h2>{page.storeTitle}</h2><p>{page.storeSubtitle || `${shop.products.length} free and paid offerings from ${name || 'me'}.`}</p></div></header>
              <Shop items={shop.products} slug={slug} owner={name} preview={preview} />
            </LiquidGlass>
          )}
        </section>

        <LiquidGlass as="aside" className="pp-side" radius={rad} refract>
          <h2>{name}</h2>
          {tagline && <p className="pp-role">{tagline}</p>}
          {about && <p className="pp-about">{about}</p>}
          <div className="pp-actions">
            <a className="pp-btn" href={`/u/${slug}`} target="_blank" rel="noreferrer">{page.openLabel} ↗</a>
            <button className="pp-btn ghost" onClick={() => setTalk(t => !t)} aria-expanded={talk}>💬 {page.talkLabel}</button>
          </div>
          {talk && (
            <div className="pp-contact">
              {data.contact ? <>
                {data.contact.email && <div>Email: <a href={`mailto:${data.contact.email}`}>{data.contact.email}</a></div>}
                {data.contact.phone && <div>Phone: <a href={`tel:${data.contact.phone.replace(/[^\d+]/g, '')}`}>{data.contact.phone}</a></div>}
                {data.contact.location && <div>Location: {data.contact.location}</div>}
                {data.contact.other && <div>{data.contact.other}</div>}
              </> : <div>{first(name) || 'This member'} hasn't published contact details. <a href={`/u/${slug}`}>Ask the persona instead.</a></div>}
            </div>
          )}

          {sec.expertise && exp.length > 0 && <><h3>◈ Expertise</h3><div className="pp-tags">{exp.map(x => <span key={x}>{x}</span>)}</div></>}
          {sec.education && data.education?.length > 0 && <><h3>🎓 Education</h3>{data.education.map((e, i) => <p className="pp-edu" key={i}>{[e.qualification, e.specialization].filter(Boolean).join(', ')}{e.institution ? `, ${e.institution}` : ''}</p>)}</>}
          {sec.experience && data.experience && (data.experience.description || data.experience.employers?.length || data.experience.total_years != null) && (
            <><h3>💼 Experience{data.experience.total_years != null ? ` · ${data.experience.total_years} yrs` : ''}</h3>
              {data.experience.employers?.map((e, i) => <p className="pp-edu" key={i}><b>{e.role}</b>{e.company ? ` at ${e.company}` : ''}{e.duration ? ` (${e.duration})` : ''}</p>)}
              {data.experience.description && <p className="pp-edu">{data.experience.description}</p>}</>
          )}

          {side.map(k => {
            const key = `${k.category}|${k.subtype}`, label = k.subtype ? `${k.category}: ${k.subtype}` : k.category;
            if (k.items.length) return <div key={key} className="pp-blk"><h3>{ICON[k.category] || '✨'} {label}</h3>{k.description && <p className="pp-edu">{k.description}</p>}{k.items.map(it => <div key={it.id}>{Offer({ o: it })}</div>)}</div>;
            return <div key={key} className="pp-row"><span>{ICON[k.category] || '✨'}</span><div><strong>{label}</strong><small>{k.description || (k.intent === 'free' ? 'Offered free' : k.intent === 'paid' ? 'Offered as a paid service' : 'Get in touch to know more')}</small></div></div>;
          })}
        </LiquidGlass>
      </main>

      {o && (
        <div className="pp-modal" onClick={() => setOpen(null)}>
          <LiquidGlass className="pp-sheet" radius={rad} refract role="dialog" aria-modal="true" aria-label={o.title} onClick={e => e.stopPropagation()}>
            <button className="pp-x" onClick={() => setOpen(null)} aria-label="Close">✕</button>
            <div className="pp-sheet-img"><Thumb o={o} i={0} /></div>
            <span className="pp-badge static">{o.badge}</span>
            <h3>{o.title}</h3>
            {fmtPrice(o, cur) && <strong className="pp-price">{fmtPrice(o, cur)}</strong>}
            {o.description && <p>{o.description}</p>}
            {Object.entries(o.details || {}).map(([k, v]) => <div className="pp-meta" key={k}><b>{k.replace(/_/g, ' ')}</b> {v}</div>)}
            <div className="pp-rate big"><Stars avg={ov.avg} count={ov.count} /><small>{ov.count ? `${ov.avg.toFixed(1)} (${ov.count})` : 'No ratings yet'}</small><StarInput mine={ov.mine} onRate={n => rate(o, n)} /></div>
            <div className="pp-offer-act">
              {['free', 'paid'].includes(o.pricing) ? <button className="pp-btn" onClick={() => openCheckout(o)}>{o.pricing === 'free' ? 'Get free' : 'Buy now'}</button>
                : o.link ? <a className="pp-btn" href={o.link} target="_blank" rel="noopener noreferrer nofollow" onClick={() => click(o)}>Open ↗</a>
                  : mail(o) && <a className="pp-btn" href={mail(o)} onClick={() => click(o)}>Enquire</a>}
              <button className="pp-btn ghost" onClick={() => ask(o)}>Ask about this</button>
            </div>
          </LiquidGlass>
        </div>
      )}

      {buying && <CheckoutDialog item={buying} slug={slug} owner={name} preview={preview} onClose={() => setBuying(null)} />}
    </div>
    </GlassProvider>
  );
}
