import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const money = o => (o.pricing === 'paid' ? (o.price != null ? `${o.currency || ''} ${o.price}`.trim() : 'Paid') : o.pricing === 'free' ? 'Free' : '');

export default function PublicProfile() {
  const { slug } = useParams();
  const [p, setP] = useState(undefined);
  useEffect(() => {
    fetch(`/api/profile?slug=${encodeURIComponent(slug)}`).then(r => (r.ok ? r.json() : null)).then(setP, () => setP(null));
  }, [slug]);
  if (p === undefined) return <p className="muted" style={{ padding: 40 }}>Loading…</p>;
  if (!p) return <main className="pp"><h1>Profile not found</h1><p className="muted">This profile doesn't exist or isn't public.</p></main>;
  const x = p.experience, yrs = x?.total_years;
  return (
    <main className="pp">
      <header>
        <h1>{p.name}</h1>
        {p.designation && <p className="role">{p.designation}</p>}
        {p.purpose && <p className="lead">{p.purpose}</p>}
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
          {k.offerings.map((o, i) => (
            <article className="offer" key={i}>
              <div className="row" style={{ justifyContent: 'space-between' }}><b>{o.title}</b><span className="muted">{money(o)}</span></div>
              {o.description && <p>{o.description}</p>}
              {Object.entries(o.details || {}).map(([key, v]) => <div className="muted" key={key}>{key.replace(/_/g, ' ')}: {v}</div>)}
            </article>
          ))}
        </section>
      ))}
      {p.contact && <section><h2>Contact</h2>{Object.entries(p.contact).map(([k, v]) => <p key={k}>{k[0].toUpperCase() + k.slice(1)}: {k === 'email' ? <a href={`mailto:${v}`}>{v}</a> : v}</p>)}</section>}
    </main>
  );
}
