import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PersonaBall, { amp } from './PersonaBall.jsx';
import { ACCENTS, normalizePage } from '../../shared/pageSettings.js';
import { cartable, fmtPrice } from '../lib/money.js';
import { track } from '../lib/track.js';
import '../styles/profilePage.css';

const SINGULAR = { Books: 'Book', 'Other Contributions': 'Other', 'Information & Knowledge': 'Knowledge', 'Advice & Suggestions': 'Advice', 'In-Person Discussions': 'Discussion', 'Talk Shows': 'Talk show' };
const ICON = { Books: '📖', Content: '📄', 'Information & Knowledge': 'ℹ️', 'In-Person Discussions': '👥', 'Advice & Suggestions': '💡', 'Talk Shows': '🎙️', 'Other Contributions': '✨' };
const TILE = ['#ede9fe', '#e0f2fe', '#dcfce7', '#fef3c7', '#ffe4e6', '#f1f5f9'];
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
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
function useSeen(ref, enabled, fire) {   // counts a "view" once the card has been mostly on screen for a second
  useEffect(() => {
    if (!enabled || !ref.current || !('IntersectionObserver' in window)) return undefined;
    let t; const io = new IntersectionObserver(([e]) => { clearTimeout(t); if (e.isIntersecting) t = setTimeout(() => { fire(); io.disconnect(); }, 1000); }, { threshold: 0.6 });
    io.observe(ref.current); return () => { clearTimeout(t); io.disconnect(); };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}

function Thumb({ o, i }) {
  return o.image
    ? <img src={o.image} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; }} />
    : <span className="pp-tile" style={{ background: TILE[i % TILE.length] }} aria-hidden="true">{ICON[o.category] || '✨'}</span>;
}

function ProductCard({ o, i, cur, cart, preview, onAdd, onOpen }) {
  const ref = useRef(null);
  useSeen(ref, !preview, () => track({ kind: 'view', id: o.id }));
  const price = fmtPrice(o, cur);
  return (
    <article className="pp-prod" ref={ref}>
      <button className="pp-prod-img" onClick={() => onOpen(o)} aria-label={`Details: ${o.title}`}><Thumb o={o} i={i} /><span className="pp-badge">{o.badge}</span></button>
      <h4>{o.title}</h4>
      <p>{o.description || ' '}</p>
      <div className="pp-prod-foot">
        <strong>{price}</strong>
        {cart && cartable(o) ? <button className="pp-link" onClick={() => onAdd(o)}>🛒 Add to Cart</button> : <button className="pp-link" onClick={() => onOpen(o)}>◈ View Details</button>}
      </div>
    </article>
  );
}

export default function ProfilePage({ data, slug, user, preview = false, heroOverride }) {
  const page = useMemo(() => normalizePage(data.page), [data.page]);
  const cur = page.currency, accent = ACCENTS[page.accent] || ACCENTS.violet;
  const hero = heroOverride !== undefined ? heroOverride : data.hero;
  const name = data.name || '', me = first(name);

  // ---- offerings, split by where the owner wants them
  const { store, side, all } = useMemo(() => {
    const store = [], side = [], all = [];
    for (const k of data.contributions || []) {
      const where = page.placement[k.category] || 'side';
      if (where === 'hidden') continue;
      const items = k.offerings.map(o => ({ ...o, category: k.category, subtype: k.subtype, badge: k.subtype || SINGULAR[k.category] || k.category }));
      all.push(...items);
      if (where === 'store') store.push(...items); else side.push({ ...k, items });
    }
    return { store, side, all };
  }, [data.contributions, page.placement]);

  // ---- smart defaults from the real profile (empty setting = use these)
  const exp = data.expertise || [];
  const subtitle = page.subtitle || `Get answers about ${exp.length ? exp.slice(0, 3).join(', ').toLowerCase() : 'my work'}, what I offer, or browse what I share.`;
  const chips = page.chips.length ? page.chips : [
    { label: 'About me', prompt: 'Tell me about yourself and your work' },
    ...(store.length ? [{ label: "What's in the store?", prompt: "What's in your store?" }] : []),
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

  // ---- cart (kept in this browser; money changes hands on each seller link, see the drawer)
  const ck = `pp-cart:${slug}`;
  const [cart, setCart] = useState(() => (preview ? [] : lsGet(ck, []))), [cartOpen, setCartOpen] = useState(false);
  useEffect(() => { if (!preview) lsSet(ck, cart); }, [cart]); // eslint-disable-line react-hooks/exhaustive-deps
  const cartIds = useMemo(() => new Set(all.map(o => o.id)), [all]);
  const lines = cart.filter(l => cartIds.has(l.id)).map(l => ({ ...l, o: all.find(o => o.id === l.id) }));
  const count = lines.reduce((s, l) => s + l.n, 0);
  const totals = lines.reduce((m, l) => { const c = l.o.currency || cur; m[c] = (m[c] || 0) + l.o.price * l.n; return m; }, {});
  const add = o => { setCart(c => c.some(l => l.id === o.id) ? c.map(l => l.id === o.id ? { ...l, n: l.n + 1 } : l) : [...c, { id: o.id, n: 1 }]); setCartOpen(true); setOpen(null); };
  const bump = (id, d) => setCart(c => c.map(l => l.id === id ? { ...l, n: l.n + d } : l).filter(l => l.n > 0));

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
  const [talk, setTalk] = useState(false), [open, setOpen] = useState(null), [filter, setFilter] = useState('All'), [showAll, setShowAll] = useState(false);
  const mail = (o, subject) => data.contact?.email ? `mailto:${data.contact.email}?subject=${encodeURIComponent(subject || `Interested in: ${o.title}`)}` : data.contact?.phone ? `tel:${data.contact.phone.replace(/[^\d+]/g, '')}` : null;
  useEffect(() => { if (!open) return undefined; const k = e => e.key === 'Escape' && setOpen(null); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open]);

  const badges = [...new Set(store.map(o => o.badge))];
  const shown = (filter === 'All' ? store : store.filter(o => o.badge === filter));
  const visible = showAll ? shown : shown.slice(0, page.storeLimit);
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
          {o.link && <a className="pp-btn small" href={o.link} target="_blank" rel="noopener noreferrer nofollow" onClick={() => click(o)}>{o.pricing === 'paid' ? 'Buy / book' : 'Open'}</a>}
          {!o.link && mail(o) && <a className="pp-btn small" href={mail(o)} onClick={() => click(o)}>Enquire</a>}
          <button className="pp-btn small ghost" onClick={() => ask(o)}>Ask about this</button>
        </div>
      </div>
    );
  }

  const o = open, ov = o ? view(o) : null;
  return (
    <div className={`pp-page${preview ? ' is-preview' : ''}`} style={{ '--a1': accent[0], '--a2': accent[1] }}>
      <div className="pp-top">
        {page.cart && store.some(cartable) && <button className="pp-icon" onClick={() => setCartOpen(true)} aria-label={`Cart, ${count} items`}>🛒{count > 0 && <b>{count}</b>}</button>}
        {user ? <Link className="pp-icon" to="/admin" aria-label="Dashboard">👤</Link> : null}
      </div>
      {note && <div className="pp-toast" role="status">{note}</div>}

      <main className="pp-grid">
        <section className="pp-main">
          <div className="pp-hero">
            <div className="pp-wave" aria-hidden="true" />
            <div className="pp-photo">
              {hero
                ? <img src={hero} alt={name} style={{ objectPosition: `${page.hero.x}% ${page.hero.y}%`, transform: `scale(${page.hero.zoom})` }} />
                : <PersonaBall mode={mode} impulse={impulse} width={220} height={220} dotColor={[99, 102, 241]} glowColor={[168, 85, 247]} lightTheme />}
            </div>
            <div className="pp-hero-body">
              <h1>{page.headline || 'Hi! Ask me about my'} <em>{page.headlineAccent || 'work.'}</em></h1>
              <p>{subtitle}</p>
              <div className="pp-chips">{chips.map(c => <button key={c.label} onClick={() => { setInput(c.prompt); inputRef.current?.focus(); }}>{c.label}</button>)}</div>
              <form className="pp-ask" onSubmit={send}>
                <span aria-hidden="true">✦</span>
                <input ref={inputRef} value={input} onChange={e => { setInput(e.target.value); setImpulse(0.25); }} placeholder={page.placeholder || 'Ask me anything about my work, what I offer, or my ideas…'} aria-label="Ask a question" />
                {SR && <button type="button" className={`pp-mic${listening ? ' on' : ''}`} onClick={mic} aria-label={listening ? 'Stop listening' : 'Speak your question'}>🎙️</button>}
                <button className="pp-send" disabled={busy || !input.trim()} aria-label="Send">→</button>
              </form>
              {(answer || busy) && <div className="pp-answer" aria-live="polite"><p>{answer || 'Searching my notes…'}</p>{sources.length > 0 && <small>Sources: {sources.join(' · ')}</small>}</div>}
            </div>
          </div>

          {sec.store && store.length > 0 && (
            <div className="pp-card pp-store" id="store">
              <header><span className="pp-hex">⬡</span><div><h2>{page.storeTitle}</h2><p>{page.storeSubtitle || `${store.length} ${store.length === 1 ? 'item' : 'items'} from ${name || 'me'}, ready to use or order.`}</p></div></header>
              {badges.length > 1 && <div className="pp-filter">{['All', ...badges].map(b => <button key={b} className={filter === b ? 'on' : ''} onClick={() => setFilter(b)}>{b}</button>)}</div>}
              <div className="pp-products">{visible.map((p, i) => <ProductCard key={p.id} o={p} i={i} cur={cur} cart={page.cart} preview={preview} onAdd={add} onOpen={setOpen} />)}</div>
              {shown.length > page.storeLimit && <button className="pp-more" onClick={() => setShowAll(s => !s)}>{showAll ? 'Show less' : `Show all ${shown.length}`}</button>}
            </div>
          )}
        </section>

        <aside className="pp-card pp-side">
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
        </aside>
      </main>

      {o && (
        <div className="pp-modal" onClick={() => setOpen(null)}>
          <div className="pp-sheet" role="dialog" aria-modal="true" aria-label={o.title} onClick={e => e.stopPropagation()}>
            <button className="pp-x" onClick={() => setOpen(null)} aria-label="Close">✕</button>
            <div className="pp-sheet-img"><Thumb o={o} i={0} /></div>
            <span className="pp-badge static">{o.badge}</span>
            <h3>{o.title}</h3>
            {fmtPrice(o, cur) && <strong className="pp-price">{fmtPrice(o, cur)}</strong>}
            {o.description && <p>{o.description}</p>}
            {Object.entries(o.details || {}).map(([k, v]) => <div className="pp-meta" key={k}><b>{k.replace(/_/g, ' ')}</b> {v}</div>)}
            <div className="pp-rate big"><Stars avg={ov.avg} count={ov.count} /><small>{ov.count ? `${ov.avg.toFixed(1)} (${ov.count})` : 'No ratings yet'}</small><StarInput mine={ov.mine} onRate={n => rate(o, n)} /></div>
            <div className="pp-offer-act">
              {page.cart && cartable(o) && <button className="pp-btn" onClick={() => add(o)}>🛒 Add to Cart</button>}
              {o.link && <a className="pp-btn" href={o.link} target="_blank" rel="noopener noreferrer nofollow" onClick={() => click(o)}>{o.pricing === 'paid' ? 'Buy / book' : 'Open'} ↗</a>}
              {!o.link && mail(o) && <a className="pp-btn" href={mail(o)} onClick={() => click(o)}>Enquire</a>}
              <button className="pp-btn ghost" onClick={() => ask(o)}>Ask about this</button>
            </div>
          </div>
        </div>
      )}

      {cartOpen && (
        <div className="pp-modal right" onClick={() => setCartOpen(false)}>
          <aside className="pp-drawer" onClick={e => e.stopPropagation()} aria-label="Cart">
            <header><h3>Cart ({count})</h3><button className="pp-x" onClick={() => setCartOpen(false)} aria-label="Close cart">✕</button></header>
            <div className="pp-lines">
              {!lines.length && <p className="pp-empty">Your cart is empty.</p>}
              {lines.map(l => (
                <div className="pp-line" key={l.id}>
                  <div className="pp-line-img"><Thumb o={l.o} i={0} /></div>
                  <div><strong>{l.o.title}</strong><small>{fmtPrice(l.o, cur)} each</small>
                    {l.o.link ? <a href={l.o.link} target="_blank" rel="noopener noreferrer nofollow" onClick={() => click(l.o)}>Buy this item ↗</a> : mail(l.o) ? <a href={mail(l.o)} onClick={() => click(l.o)}>Enquire to buy</a> : null}</div>
                  <span className="pp-qty"><button onClick={() => bump(l.id, -1)} aria-label="Fewer">−</button>{l.n}<button onClick={() => bump(l.id, 1)} aria-label="More">+</button></span>
                </div>
              ))}
            </div>
            {lines.length > 0 && (
              <footer>
                {Object.entries(totals).map(([c, v]) => <div className="pp-total" key={c}><span>Subtotal</span><b>{fmtPrice({ pricing: 'paid', price: v, currency: c }, cur)}</b></div>)}
                <p>Each item is paid for on {first(name) || 'the seller'}'s own link, so there is no single checkout. Use “Buy this item” for each one, or send everything in one message.</p>
                {data.contact?.email && <a className="pp-btn block" href={`mailto:${data.contact.email}?subject=${encodeURIComponent('Order enquiry')}&body=${encodeURIComponent(lines.map(l => `${l.n} × ${l.o.title}`).join('\n'))}`}>Send my list by email</a>}
              </footer>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
