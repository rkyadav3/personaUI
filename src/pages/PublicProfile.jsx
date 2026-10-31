import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import GlassShell from '../components/GlassShell.jsx';
import { money } from '../components/Offers.jsx';
import { StarInput, Stars } from '../components/Stars.jsx';
import { track } from '../lib/track.js';
import { compact, safeHref } from '../lib/ui.js';

export default function PublicProfile() {
  return <GlassShell><Profile /></GlassShell>;
}

/** A member's profile. Visitors land here from the home page; the persona (the AI chat) is one click further. */
function Profile() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const focus = Number(params.get('o')) || null;   // an offering the visitor came for, from a card on the home page
  const [p, setP] = useState(undefined), [talk, setTalk] = useState(false);

  useEffect(() => {
    setP(undefined); setTalk(false);
    fetch(`/api/profile?slug=${encodeURIComponent(slug)}`).then(r => (r.ok ? r.json() : null)).then(setP, () => setP(null));
    track({ kind: 'profile', slug });
  }, [slug]);

  useEffect(() => {   // bring the offering the visitor clicked on the home page into view
    if (!p || !focus) return;
    document.getElementById(`offer-${focus}`)?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [p, focus]);

  useEffect(() => {   // an offering counts as "viewed" once it has been on screen, mostly visible, for a second
    if (!p || !('IntersectionObserver' in window)) return;
    const timers = new Map();
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        const id = Number(e.target.dataset.oid);
        if (e.isIntersecting) timers.set(id, setTimeout(() => { track({ kind: 'view', id }); io.unobserve(e.target); }, 1000));
        else { clearTimeout(timers.get(id)); timers.delete(id); }
      }
    }, { threshold: 0.6 });
    document.querySelectorAll('[data-oid]').forEach(el => io.observe(el));
    return () => { io.disconnect(); timers.forEach(clearTimeout); };
  }, [p]);

  if (p === undefined) return <p className="muted" style={{ padding: 40 }}>Loading…</p>;
  if (!p) return <main className="pp"><h1>Profile not found</h1><p className="muted">This profile doesn't exist or isn't public.</p><p><Link to="/">← All members</Link></p></main>;
  const x = p.experience, yrs = x?.total_years, first = p.name?.split(' ')[0] || 'me';
  const email = p.contact?.email, phone = p.contact?.phone;
  return (
    <main className="pp">
      <nav className="pp-nav"><Link to="/" className="pp-back">← All members</Link></nav>
      <header>
        <h1>{p.name}</h1>
        {p.designation && <p className="role">{p.designation}</p>}
        {p.purpose && <p className="lead">{p.purpose}</p>}
        <div className="pp-actions">
          <Link className="btn primary" to={`/u/${slug}`}>Open persona</Link>
          <button className="btn" onClick={() => setTalk(t => !t)} aria-expanded={talk} aria-controls="pp-talk">Talk to me</button>
        </div>
        {talk && (
          <div className="pp-talk" id="pp-talk">
            {email || phone ? <>
              <span className="muted">Reach {first} directly:</span>
              {email && <a className="btn" href={`mailto:${email}?subject=${encodeURIComponent(`Hello ${first}`)}`}>Email</a>}
              {phone && <a className="btn" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>Call</a>}
            </> : <>
              <span className="muted">{first} hasn't shared contact details. You can ask their persona instead.</span>
              <Link className="btn" to={`/u/${slug}`}>Open persona</Link>
            </>}
          </div>
        )}
        {p.views > 0 && <p className="pp-views muted">{compact(p.views)} profile {p.views === 1 ? 'view' : 'views'}</p>}
      </header>
      {p.expertise.length > 0 && <section><h2>Expertise</h2><div className="chips">{p.expertise.map(e => <span className="chip" key={e}>{e}</span>)}</div></section>}
      {x && (x.description || yrs != null || x.employers?.length > 0) && (
        <section><h2>Experience</h2>
          {yrs != null && <p>{yrs} years</p>}{x.description && <p>{x.description}</p>}
          {x.employers?.map((e, i) => <p key={i} className="muted">{[e.role, e.company, e.duration].filter(Boolean).join(' · ')}</p>)}
        </section>
      )}
      {p.education.length > 0 && <section><h2>Education</h2>{p.education.map((e, i) => <p key={i}>{[e.qualification, e.specialization].filter(Boolean).join(', ')}{e.institution ? `, ${e.institution}` : ''}</p>)}</section>}
      {p.contributions.map(k => (
        <section key={`${k.category}${k.subtype}`}>
          <h2>{k.subtype ? `${k.category}: ${k.subtype}` : k.category}</h2>
          {k.description && <p>{k.description}</p>}
          {k.offerings.map(o => <Offer key={o.id} o={o} email={email} focused={o.id === focus} />)}
        </section>
      ))}
      {p.contact && <section><h2>Contact</h2>{Object.entries(p.contact).map(([k, v]) => <p key={k}>{k[0].toUpperCase() + k.slice(1)}: {k === 'email' ? <a href={`mailto:${v}`}>{v}</a> : v}</p>)}</section>}
    </main>
  );
}

function Offer({ o, email, focused }) {
  const { buy_link, cover_image, ...rest } = o.details || {};
  const cover = safeHref(cover_image), href = safeHref(buy_link), price = money(o);
  const mail = !href && email ? `mailto:${email}?subject=${encodeURIComponent(`Interested in: ${o.title}`)}` : null;
  const [stat, setStat] = useState({ avg: o.ratingAvg, count: o.ratingCount }), [msg, setMsg] = useState('');
  const [mine, setMine] = useState(() => { try { return Number(localStorage.getItem(`rated:${o.id}`)) || 0; } catch { return 0; } });

  async function rate(n) {
    setMsg('');
    const r = await track({ kind: 'rate', id: o.id, stars: n });
    if (r?.ok) {
      setStat({ avg: r.avg, count: r.count }); setMine(n); setMsg('Thanks for rating.');
      try { localStorage.setItem(`rated:${o.id}`, String(n)); } catch { /* private mode */ }
    } else setMsg(r?.error || 'Could not save your rating. Try again.');
  }

  return (
    <article className={`offer${focused ? ' focus' : ''}`} id={`offer-${o.id}`} data-oid={o.id}>
      <div className="offer-grid">
        {cover && <img className="offer-cover" src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none'; }} />}
        <div className="offer-main">
          <div className="row" style={{ justifyContent: 'space-between' }}><b>{o.title}</b><span className="muted">{price}</span></div>
          {o.description && <p>{o.description}</p>}
          {Object.entries(rest).map(([key, v]) => <div className="muted" key={key}>{key.replace(/_/g, ' ')}: {v}</div>)}
          <div className="offer-foot">
            <Stars value={stat.avg} count={stat.count} showEmpty />
            <span className="offer-rate"><span className="muted">{mine ? 'Your rating' : 'Rate it'}</span><StarInput mine={mine} onRate={rate} /></span>
            {(href || mail) && <a className="btn primary" href={href || mail} {...(href ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})} onClick={() => track({ kind: 'click', id: o.id })}>{href ? (o.pricing === 'paid' ? 'Buy / book' : 'Open') : 'Enquire by email'}</a>}
          </div>
          {msg && <p className="hint" role="status">{msg}</p>}
        </div>
      </div>
    </article>
  );
}
