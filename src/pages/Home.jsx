import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Glass } from 'open-glass-ui';
import { CATEGORIES } from '../../shared/profileSchema.js';
import { buildRails } from '../../shared/ranking.js';
import GlassShell from '../components/GlassShell.jsx';
import { money } from '../components/Offers.jsx';
import { Stars } from '../components/Stars.jsx';
import { Notice } from '../components/Ui.jsx';
import { api } from '../lib/api.js';
import { ago, compact, gradient, initials } from '../lib/ui.js';

/** The private platform's front door: browse members and see what is newest, best rated and most opened.
 *  Visitors do not need an account. Clicking anything opens the member's PROFILE; the persona is one click further. */
export default function Home() {
  return <GlassShell><Page /></GlassShell>;
}

// What each rail shows under a card, and how it is titled. Order = order on the page. Empty rails are hidden.
const RAILS = [
  { key: 'topRated', title: 'Top rated', sub: 'Best reviewed by visitors', note: o => <Stars value={o.ratingAvg} count={o.ratingCount} /> },
  { key: 'mostViewed', title: 'Most viewed', sub: 'What people are opening the most', note: o => `${compact(o.views)} ${o.views === 1 ? 'view' : 'views'}` },
  { key: 'inDemand', title: 'In demand', sub: 'Most buy, book and enquire clicks', note: o => `${compact(o.clicks)} ${o.clicks === 1 ? 'request' : 'requests'}` },
  { key: 'latest', title: 'Latest', sub: 'Newly published', note: o => ago(o.createdAt) },
];

function Page() {
  const [feed, setFeed] = useState(null), [error, setError] = useState('');
  const [q, setQ] = useState(''), [cat, setCat] = useState(''), [sort, setSort] = useState('new');
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch('/api/home').then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; })
      .then(d => { setFeed(d); document.title = d.name; }, e => setError(e.message || 'Could not load the members.'));
  }, []);
  useEffect(() => {   // only decides Sign in vs Dashboard, so it waits a moment instead of competing with the page
    const t = setTimeout(() => api('auth.me').then(m => setUser(m.user), () => {}), 700);
    return () => clearTimeout(t);
  }, []);

  const needle = q.trim().toLowerCase();
  const titlesBySlug = useMemo(() => {
    const m = new Map();
    for (const o of feed?.offers || []) m.set(o.slug, `${m.get(o.slug) || ''} ${o.title}`.toLowerCase());
    return m;
  }, [feed]);

  const offers = useMemo(() => (feed?.offers || []).filter(o => (!cat || o.category === cat)
    && (!needle || `${o.title} ${o.description} ${o.member} ${o.category} ${o.subtype}`.toLowerCase().includes(needle))), [feed, cat, needle]);
  const rails = useMemo(() => buildRails(offers), [offers]);

  const members = useMemo(() => {
    const list = (feed?.members || []).filter(m => (!cat || m.categories.includes(cat))
      && (!needle || `${m.name} ${m.designation || ''} ${m.purpose || ''} ${m.expertise.join(' ')} ${m.categories.join(' ')} ${titlesBySlug.get(m.slug) || ''}`.toLowerCase().includes(needle)));
    const by = { new: (a, b) => String(b.joined || '').localeCompare(String(a.joined || '')), views: (a, b) => b.views - a.views, name: (a, b) => a.name.localeCompare(b.name) };
    return [...list].sort(by[sort]);
  }, [feed, cat, needle, sort, titlesBySlug]);

  const categories = useMemo(() => CATEGORIES.filter(c => (feed?.offers || []).some(o => o.category === c)), [feed]);
  const mode = feed?.mode || 'invite';
  const filtering = Boolean(cat || needle);

  return (
    <div className="home">
      <Glass as="div" material="regular" className="home-nav">
        <Link to="/" className="home-brand"><i aria-hidden="true" />{feed?.name || 'Persona'}</Link>
        <nav aria-label="Account">
          {user ? <Link to="/admin">Dashboard</Link> : <>
            <Link to="/admin">Sign in</Link>
            {mode !== 'closed' && <Link to="/admin?tab=register" className="cta">{mode === 'invite' ? 'I have an invite' : 'Create account'}</Link>}
          </>}
        </nav>
      </Glass>

      <div className="home-tools">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search people, books, talks, topics…" aria-label="Search" />
        {categories.length > 0 && (
          <div className="home-cats" role="group" aria-label="Filter by category">
            <button className={!cat ? 'on' : ''} onClick={() => setCat('')}>All</button>
            {categories.map(c => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(cat === c ? '' : c)}>{c}</button>)}
          </div>
        )}
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {!feed && !error && <p className="muted home-empty">Loading…</p>}

      {feed && RAILS.map(r => rails[r.key].length > 0 && (
        <Rail key={r.key} title={cat ? `${r.title} in ${cat}` : r.title} sub={r.sub}>
          {rails[r.key].map(o => <OfferCard key={o.id} o={o} note={r.note(o)} />)}
        </Rail>
      ))}
      {feed && filtering && offers.length === 0 && members.length === 0 && <p className="muted home-empty">Nothing matches that. Try another word or clear the filter.</p>}

      {feed && (
        <section className="home-sec" aria-labelledby="members-h">
          <div className="home-sec-head">
            <div><h2 id="members-h">Members</h2><p className="muted">{members.length} {members.length === 1 ? 'person' : 'people'}{filtering ? ' match' : ''}. Open a card to see their profile.</p></div>
            <label className="home-sort">Sort
              <select value={sort} onChange={e => setSort(e.target.value)}>
                <option value="new">Newest</option><option value="views">Most viewed</option><option value="name">A to Z</option>
              </select>
            </label>
          </div>
          {members.length > 0
            ? <div className="mgrid">{members.map(m => <MemberCard key={m.slug} m={m} />)}</div>
            : !filtering && <p className="muted home-empty">No members yet. Profiles appear here as soon as they are published.</p>}
        </section>
      )}

      <footer className="home-foot muted">{mode === 'invite' ? 'A private community. Members join by invitation.' : feed?.name}</footer>
    </div>
  );
}

function Rail({ title, sub, children }) {
  const ref = useRef(null);
  const nudge = dir => ref.current?.scrollBy({ left: dir * Math.max(240, ref.current.clientWidth * 0.8), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  return (
    <section className="home-sec" aria-label={title}>
      <div className="home-sec-head">
        <div><h2>{title}</h2><p className="muted">{sub}</p></div>
        <div className="rail-btns"><button onClick={() => nudge(-1)} aria-label={`Scroll ${title} back`}>‹</button><button onClick={() => nudge(1)} aria-label={`Scroll ${title} forward`}>›</button></div>
      </div>
      <div className="rail" ref={ref}>{children}</div>
    </section>
  );
}

function Img({ src }) {
  const [bad, setBad] = useState(false);
  return src && !bad ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} /> : null;
}

function OfferCard({ o, note }) {
  const price = money(o);
  return (
    <Link className="rcard" to={`/p/${o.slug}?o=${o.id}`}>
      <div className="rcard-img" style={{ background: gradient(`${o.category}${o.id}`) }}>
        <span className="rcard-letter" aria-hidden="true">{o.category[0]}</span>
        <Img src={o.image} />
        <em>{o.subtype || o.category}</em>
        {price && <b className={o.pricing === 'free' ? 'free' : ''}>{price}</b>}
      </div>
      <div className="rcard-body">
        <strong>{o.title}</strong>
        <small>by {o.member}</small>
        <span className="rcard-note">{note}</span>
      </div>
    </Link>
  );
}

function MemberCard({ m }) {
  return (
    <Link className="mcard" to={`/p/${m.slug}`}>
      <div className="mcard-cover" style={{ background: gradient(m.slug) }}><Img src={m.cover} /></div>
      <span className="mcard-av" style={{ background: gradient(`${m.name}${m.slug}`) }} aria-hidden="true">{initials(m.name)}</span>
      <div className="mcard-body">
        <h3>{m.name}</h3>
        {m.designation && <p className="mcard-role">{m.designation}</p>}
        {m.purpose && <p className="mcard-purpose">{m.purpose}</p>}
        {m.expertise.length > 0 && <div className="mcard-chips">{m.expertise.slice(0, 3).map(e => <span key={e}>{e}</span>)}</div>}
        <div className="mcard-foot">
          <span>{m.offerCount > 0 ? `${m.offerCount} ${m.offerCount === 1 ? 'offering' : 'offerings'}` : 'No offerings yet'}</span>
          {m.location && <span>{m.location}</span>}
        </div>
      </div>
    </Link>
  );
}
