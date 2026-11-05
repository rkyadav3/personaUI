import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ACCENTS, FONT_STACK, normalizePage } from '../../../shared/pageSettings.js';
import { splitSchedule } from '../../../shared/engage.js';
import { SOCIAL_KINDS } from '../../../shared/portfolio.js';
import { resolveSite } from '../../lib/portfolioModel.js';
import EnquiryForm from './EnquiryForm.jsx';
import Icon from './Icon.jsx';
import { EventRow, UpdateCard } from './Updates.jsx';
import Events from './Events.jsx';
import Shop from '../commerce/Shop.jsx';
import Chat from './Chat.jsx';
import BackgroundLayer from '../BackgroundLayer.jsx';
import LiquidGlass, { GlassProvider } from '../LiquidGlass.jsx';
import '../../styles/portfolio.css';

const luminance = h => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
const paras = s => String(s || '').split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
const isExt = u => /^https?:\/\//i.test(u);

/** Opens outside links in a new tab and keeps contact links on the current page. */
function A({ href, className, children, onClick, ...rest }) {
  if (!href) return null;
  const ext = isExt(href);
  return <a className={className} href={href} onClick={onClick} {...(ext ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})} {...rest}>{children}</a>;
}

/** Link to another page of the same site (a router link live, a button inside the editor preview). */
function GoTo({ to, ctx, className, children, ...rest }) {
  const path = ctx.pages.find(p => p.key === to)?.path || `/p/${ctx.slug}`;
  if (ctx.preview) return <button type="button" className={className} onClick={() => ctx.go(to)} {...rest}>{children}</button>;
  return <Link className={className} to={path} {...rest}>{children}</Link>;
}

/** A picture that quietly disappears if its URL is broken, so the fallback shows instead of a broken-image icon. */
function Pic({ src, className, style, fallback = null }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  if (!src || bad) return fallback;
  return <img className={className} style={style} src={src} alt="" loading="lazy" onError={() => setBad(true)} />;
}
const Tile = ({ text, icon, className = '' }) => <span className={`pf-tile ${className}`} aria-hidden="true">{icon ? <Icon n={icon} size={28} /> : (String(text || '?').trim()[0] || '?').toUpperCase()}</span>;


function SectionHead({ kicker, title, action }) {
  return (
    <header className="pf-sec-head">
      <div>{kicker && <span className="pf-kicker">{kicker}</span>}<h2>{title}</h2></div>
      {action}
    </header>
  );
}

// ------------------------------------------------------------------ home blocks
function Hero({ m, ctx }) {
  const hasLeft = m.bio || m.availability || m.socials.length;
  return (
    <section className="pf-hero">
      <div className="pf-glow" aria-hidden="true" />
      <div className="pf-wrap">
        {m.awards.length > 0 && (
          <div className="pf-awards">
            {m.awards.map((a, i) => (
              <div className="pf-award" key={i}><Icon n="trophy" size={22} /><div>{a.title && <small>{a.title}</small>}{a.sub && <b>{a.sub}</b>}</div></div>
            ))}
          </div>
        )}
        {(m.heroName || m.titleLine) && (
          <h1 className="pf-h1">
            {m.heroName && <span>{m.greeting} {m.heroName}</span>}
            {m.titleLine && <em>{m.titleLine}</em>}
          </h1>
        )}
        <div className={`pf-hero-grid${hasLeft ? '' : ' no-left'}`}>
          {hasLeft ? (
            <div className="pf-left">
              {m.bio && <p className="pf-bio">{m.bio}</p>}
              {m.availability && <span className="pf-avail"><i aria-hidden="true" />{m.availability}</span>}
              {m.socials.length > 0 && (
                <div className="pf-socials">{m.socials.map((s, i) => <A key={i} className="pf-soc" href={s.url} aria-label={SOCIAL_KINDS[s.kind]} title={SOCIAL_KINDS[s.kind]}><Icon n={s.kind} size={18} /></A>)}</div>
              )}
            </div>
          ) : <div />}
          <div className="pf-center">
            <div className={`pf-photo${m.photoStyle === 'bw' ? ' bw' : ''}`}>
              {m.photo
                ? <Pic src={m.photo} fallback={<span className="pf-mono">{m.initials}</span>} className="pf-photo-img"
                    style={{ objectPosition: `${m.heroPos.x ?? 50}% ${m.heroPos.y ?? 25}%`, transform: `scale(${m.heroPos.zoom ?? 1})` }} />
                : <span className="pf-mono">{m.initials}</span>}
            </div>
          </div>
          <div className="pf-right">
            {m.domains.length > 0 && <ul className="pf-domains">{m.domains.map((d, i) => <li key={i}><Icon n={d.icon} size={16} />{d.label}</li>)}</ul>}
            <div className="pf-cta">
              <A className="pf-btn dark" href={m.cta.url}>{m.cta.label} <Icon n="arrow" size={16} /></A>
              {m.intro.video ? <A className="pf-btn" href={m.intro.url}><Icon n="play" size={16} />{m.intro.label}</A> : <GoTo className="pf-btn" to="chat" ctx={ctx}><Icon n="chat" size={16} />{m.intro.label}</GoTo>}
            </div>
          </div>
        </div>
        {m.stats.length > 0 && <div className="pf-stats">{m.stats.map((s, i) => <div className="pf-stat" key={i}><b>{s.value}</b>{s.label && <span>{s.label}</span>}</div>)}</div>}
      </div>
    </section>
  );
}

function ProjectLinks({ x }) {
  return (
    <>
      {x.demoUrl && <A className="pf-btn dark sm" href={x.demoUrl}>{x.demoLabel || 'View Project'} <Icon n="arrow" size={14} /></A>}
      {x.repoUrl && <A className="pf-btn sm" href={x.repoUrl}><Icon n="github" size={14} />{x.repoLabel || 'Github'}</A>}
    </>
  );
}

function FeaturedProject({ x, ctx }) {
  return (
    <div className="pf-feat">
      <div className="pf-feat-text">
        {x.tag && <span className="pf-pill">{x.tag}</span>}
        <h3>{x.title}</h3>
        {x.summary && <p>{x.summary}</p>}
        {(x.award || x.awardSub) && <div className="pf-feat-award"><Icon n="trophy" size={18} /><div>{x.award && <b>{x.award}</b>}{x.awardSub && <small>{x.awardSub}</small>}</div></div>}
        <div className="pf-feat-act">
          <ProjectLinks x={x} />
          {x.description && !x.demoUrl && <button type="button" className="pf-btn dark sm" onClick={() => ctx.open(x)}>Details <Icon n="arrow" size={14} /></button>}
        </div>
      </div>
      <Pic src={x.image} className="pf-feat-img" />
    </div>
  );
}

function MiniProject({ x, ctx }) {
  return (
    <button type="button" className="pf-mini" onClick={() => ctx.open(x)}>
      <Tile text={x.title} icon={x.tag ? undefined : 'code'} className="sm" />
      <span className="pf-mini-text"><b>{x.title}</b>{x.summary && <small>{x.summary}</small>}</span>
      <Pic src={x.image} className="pf-mini-img" />
    </button>
  );
}

function ProjectsHome({ m, ctx }) {
  const rest = m.others.slice(0, 3);
  return (
    <section className="pf-wrap pf-sec" id="work">
      <SectionHead kicker={m.projectsKicker} title={m.projectsTitle}
        action={m.projects.length > 1 || ctx.pages.some(p => p.key === 'work') ? <GoTo to="work" ctx={ctx} className="pf-more">View All Projects <Icon n="arrow" size={14} /></GoTo> : null} />
      <LiquidGlass className="pf-panel" refract>
        <FeaturedProject x={m.featured} ctx={ctx} />
        {rest.length > 0 && <div className={`pf-minis n${rest.length}`}>{rest.map((x, i) => <MiniProject key={i} x={x} ctx={ctx} />)}</div>}
      </LiquidGlass>
    </section>
  );
}

function ProductsHome({ m, ctx }) {
  return (
    <section className="pf-wrap pf-sec" id="products">
      <SectionHead kicker={m.productsKicker} title={m.productsTitle} action={<GoTo to="products" ctx={ctx} className="pf-more">Explore All <Icon n="arrow" size={14} /></GoTo>} />
      {m.productsSubtitle && <p className="pf-shop-subtitle">{m.productsSubtitle}</p>}
      <Shop items={m.products} slug={ctx.slug} owner={m.owner} user={ctx.user} preview={ctx.preview} />
    </section>
  );
}

// ------------------------------------------------------------------ updates & schedule
/** Home page block: the next few schedule items and the latest updates. Leaves out whichever list is empty. */
function WhatsNew({ m, ctx }) {
  const now = Date.now(), next = splitSchedule(m.schedule, now).upcoming.slice(0, 3), latest = m.updates.slice(0, 3);
  if (!next.length && !latest.length) return null;
  return (
    <section className="pf-wrap pf-sec" id="updates">
      <SectionHead kicker="Stay in the loop" title="What’s new" action={<GoTo to="updates" ctx={ctx} className="pf-more">All updates <Icon n="arrow" size={14} /></GoTo>} />
      <div className="pf-upd-grid">
        {latest.length > 0 && <div><h3 className="pf-h3">Latest updates</h3><div className="pf-stack">{latest.map(u => <UpdateCard key={u.id} u={u} now={now} />)}</div></div>}
        {next.length > 0 && <div><h3 className="pf-h3">Coming up</h3><div className="pf-stack">{next.map(x => <EventRow key={x.id} x={x} now={now} />)}</div></div>}
      </div>
    </section>
  );
}

function EventsHome({ m, ctx }) {
  if (!m.events.length) return null;
  return <section className="pf-wrap pf-sec" id="events">
    <SectionHead kicker="Join the community" title="Events" />
    <Events events={m.events} slug={ctx.slug} owner={m.owner} preview={ctx.preview} />
  </section>;
}

// ------------------------------------------------------------------ sub-pages
function PageTop({ kicker, title, children }) {
  return <div className="pf-wrap pf-pagetop"><div className="pf-glow sm" aria-hidden="true" />{kicker && <span className="pf-kicker">{kicker}</span>}<h1>{title}</h1>{children}</div>;
}

function WorkPage({ m, ctx }) {
  const sorted = [...m.projects].sort((a, b) => (b === m.featured) - (a === m.featured));
  return (
    <>
      <PageTop kicker={m.projectsKicker} title={m.projectsTitle} />
      <section className="pf-wrap pf-sec tight"><div className="pf-cards">
        {sorted.map((x, i) => (
          <LiquidGlass as="article" className="pf-card pf-proj" key={i}>
            <button type="button" className="pf-proj-img" onClick={() => ctx.open(x)} aria-label={`Details: ${x.title}`}>
              <Pic src={x.image} fallback={<Tile text={x.title} icon="spark" className="lg" />} />
              {x === m.featured && <span className="pf-pill sm feat">Featured</span>}
            </button>
            <div className="pf-proj-body">
              <div className="pf-meta">{x.tag && <span className="pf-pill sm">{x.tag}</span>}{x.year && <small>{x.year}</small>}</div>
              <h3>{x.title}</h3>
              {x.summary && <p>{x.summary}</p>}
              {x.techList.length > 0 && <div className="pf-chips">{x.techList.slice(0, 6).map(t => <span key={t}>{t}</span>)}</div>}
              {(x.award || x.awardSub) && <div className="pf-line-award"><Icon n="trophy" size={15} />{[x.award, x.awardSub].filter(Boolean).join(' · ')}</div>}
              <div className="pf-feat-act"><ProjectLinks x={x} />{!x.demoUrl && !x.repoUrl && x.description && <button type="button" className="pf-btn sm" onClick={() => ctx.open(x)}>Details</button>}</div>
            </div>
          </LiquidGlass>
        ))}
      </div></section>
    </>
  );
}

function ProductsPage({ m, ctx }) {
  return (
    <>
      <PageTop kicker={m.productsKicker} title={m.productsTitle}>{m.productsSubtitle && <p className="pf-lead">{m.productsSubtitle}</p>}</PageTop>
      <section className="pf-wrap pf-sec tight"><Shop items={m.products} slug={ctx.slug} owner={m.owner} user={ctx.user} preview={ctx.preview} /></section>
    </>
  );
}

function ExperiencePage({ m }) {
  return (
    <>
      <PageTop kicker="Journey" title={m.experienceTitle}>{m.experienceNote && <p className="pf-lead">{m.experienceNote}</p>}</PageTop>
      <section className="pf-wrap pf-sec tight pf-two">
        {m.experience.length > 0 && (
          <ol className="pf-timeline">
            {m.experience.map((e, i) => (
              <li key={i}>
                {e.period && <span className="pf-pill sm">{e.period}</span>}
                <h3>{e.role || e.company}</h3>
                {e.role && e.company && <b className="pf-co">{e.company}</b>}
                {e.summary && <p>{e.summary}</p>}
              </li>
            ))}
          </ol>
        )}
        {m.education.length > 0 && (
          <LiquidGlass as="aside" className="pf-card pf-edu"><h3><Icon n="book" size={18} /> Education</h3>
            {m.education.map((e, i) => <p key={i}><b>{[e.qualification, e.specialization].filter(Boolean).join(', ')}</b>{e.institution && <small>{e.institution}</small>}</p>)}
          </LiquidGlass>
        )}
      </section>
    </>
  );
}

function TalksPage({ m }) {
  return (
    <>
      <PageTop kicker="On stage & on air" title={m.talksTitle} />
      <section className="pf-wrap pf-sec tight"><div className="pf-list">
        {m.talks.map((t, i) => (
          <LiquidGlass as="article" className="pf-card pf-talk" key={i}>
            <span className="pf-icon-box"><Icon n="mic" size={22} /></span>
            <div><h3>{t.title}</h3><small>{[t.event, t.date].filter(Boolean).join(' · ')}</small>{t.summary && <p>{t.summary}</p>}</div>
            {t.url && <A className="pf-btn sm" href={t.url}>{t.linkLabel || 'Watch / read'} <Icon n="arrow" size={14} /></A>}
          </LiquidGlass>
        ))}
      </div></section>
    </>
  );
}

function UpdatesPage({ m, ctx }) {
  const now = Date.now(), { upcoming, past } = splitSchedule(m.schedule, now);
  return (
    <>
      <PageTop kicker="Stay in the loop" title={m.updatesTitle} />
      {m.events.length > 0 && <section className="pf-wrap pf-sec tight"><h3 className="pf-h3">Events</h3><Events events={m.events} slug={ctx.slug} owner={m.owner} preview={ctx.preview} /></section>}
      <section className="pf-wrap pf-sec tight pf-upd-grid">
        {m.updates.length > 0 && <div><h3 className="pf-h3">Latest updates</h3><div className="pf-stack">{m.updates.map(u => <UpdateCard key={u.id} u={u} now={now} />)}</div></div>}
        {m.schedule.length > 0 && (
          <div>
            <h3 className="pf-h3">Schedule</h3>
            {upcoming.length > 0 ? <div className="pf-stack">{upcoming.map(x => <EventRow key={x.id} x={x} now={now} />)}</div> : <p className="pf-muted">Nothing is scheduled right now. Check back soon.</p>}
            {past.length > 0 && <details className="pf-past"><summary>Past events ({past.length})</summary><div className="pf-stack">{past.map(x => <EventRow key={x.id} x={x} now={now} past />)}</div></details>}
          </div>
        )}
      </section>
    </>
  );
}

function ContactPage({ m, ctx }) {
  const c = m.contact;
  return (
    <>
      <PageTop kicker="Get in touch" title={m.contactTitle}>{m.enquiry.intro && <p className="pf-lead">{m.enquiry.intro}</p>}</PageTop>
      <section className="pf-wrap pf-sec tight pf-contact-grid">
        <EnquiryForm slug={ctx.slug} cfg={m.enquiry} offers={m.offerOptions} owner={m.owner} preview={ctx.preview} />
        {(c || m.socials.length > 0) && (
          <LiquidGlass as="aside" className="pf-card pf-side">
            <h3 className="pf-h3">Prefer to reach out directly?</h3>
            <ul className="pf-contact">
              {c?.email && <li><Icon n="email" size={16} /><a href={`mailto:${c.email}`}>{c.email}</a></li>}
              {c?.phone && <li><Icon n="phone" size={16} /><a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>{c.phone}</a></li>}
              {c?.location && <li><Icon n="pin" size={16} />{c.location}</li>}
            </ul>
            {m.socials.length > 0 && <div className="pf-socials">{m.socials.map((s, i) => <A key={i} className="pf-soc" href={s.url} aria-label={SOCIAL_KINDS[s.kind]} title={SOCIAL_KINDS[s.kind]}><Icon n={s.kind} size={18} /></A>)}</div>}
          </LiquidGlass>
        )}
      </section>
    </>
  );
}

function AboutPage({ m }) {
  const c = m.contact;
  return (
    <>
      <PageTop kicker="About" title={m.aboutTitle} />
      <section className={`pf-wrap pf-sec tight pf-about${m.photo ? ' has-photo' : ''}`}>
        {m.photo && <div className={`pf-photo about${m.photoStyle === 'bw' ? ' bw' : ''}`}><Pic src={m.photo} className="pf-photo-img" /></div>}
        <div>
          {paras(m.aboutBody).map((t, i) => <p className="pf-body" key={i}>{t}</p>)}
          {m.skills.length > 0 && <><h3 className="pf-h3">Skills &amp; expertise</h3><div className="pf-chips lg">{m.skills.map(s => <span key={s}>{s}</span>)}</div></>}
          {(c || m.socials.length > 0) && (
            <>
              <h3 className="pf-h3">Get in touch</h3>
              <ul className="pf-contact">
                {c?.email && <li><Icon n="email" size={16} /><a href={`mailto:${c.email}`}>{c.email}</a></li>}
                {c?.phone && <li><Icon n="phone" size={16} /><a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>{c.phone}</a></li>}
                {c?.location && <li><Icon n="pin" size={16} />{c.location}</li>}
                {c?.other && <li><Icon n="spark" size={16} />{c.other}</li>}
              </ul>
              {m.socials.length > 0 && <div className="pf-socials">{m.socials.map((s, i) => <A key={i} className="pf-soc" href={s.url} aria-label={SOCIAL_KINDS[s.kind]} title={SOCIAL_KINDS[s.kind]}><Icon n={s.kind} size={18} /></A>)}</div>}
            </>
          )}
        </div>
      </section>
    </>
  );
}

function ProjectModal({ x, onClose }) {
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="pf-modal" onClick={onClose}>
      <div className="pf-sheet" role="dialog" aria-modal="true" aria-label={x.title} onClick={e => e.stopPropagation()}>
        <button type="button" className="pf-x" onClick={onClose} aria-label="Close">✕</button>
        <Pic src={x.image} className="pf-sheet-img" />
        {x.tag && <span className="pf-pill sm">{x.tag}</span>}
        <h3>{x.title}</h3>
        {(x.award || x.awardSub) && <div className="pf-line-award"><Icon n="trophy" size={15} />{[x.award, x.awardSub].filter(Boolean).join(' · ')}</div>}
        {x.summary && <p className="pf-body">{x.summary}</p>}
        {paras(x.description).map((t, i) => <p className="pf-body" key={i}>{t}</p>)}
        {x.techList.length > 0 && <div className="pf-chips">{x.techList.map(t => <span key={t}>{t}</span>)}</div>}
        <div className="pf-feat-act"><ProjectLinks x={x} /></div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the site
export default function PortfolioSite({ data, slug, sub, user, preview = false, heroOverride }) {
  const m = useMemo(() => resolveSite(data, slug, heroOverride), [data, slug, heroOverride]);
  const page = useMemo(() => normalizePage(data.page), [data.page]);
  const [pv, setPv] = useState(null), [openProj, setOpenProj] = useState(null);
  useEffect(() => { if (preview) setPv(null); }, [sub, preview]);
  const want = preview ? (pv || sub || 'home') : (sub || 'home');
  const exists = m.pages.some(p => p.key === want);
  const current = exists ? want : 'home';
  useEffect(() => { if (!preview) window.scrollTo?.(0, 0); setOpenProj(null); }, [current, preview]);

  if (!preview && !exists) return <Navigate to={`/p/${slug}`} replace />;

  const T = page.theme, accent = page.accentHex ? [page.accentHex, `color-mix(in srgb, ${page.accentHex} 55%, #ffffff)`] : (ACCENTS[page.accent] || ACCENTS.violet);
  const dark = T.bg === 'color' && luminance(T.bgColor) < 0.45;
  const ctx = { slug, user, pages: m.pages, preview, live: !preview, email: data.contact?.email || '', enquiry: m.enquiry.enabled, go: setPv, open: setOpenProj };
  const Body = { home: null, work: WorkPage, products: ProductsPage, experience: ExperiencePage, talks: TalksPage, updates: UpdatesPage, about: AboutPage, contact: ContactPage }[current];

  return (
    <GlassProvider value={{ ...page.glass, dark, radius: T.radius }}>
    <div className={`pf pf-bg-${T.bg}${dark ? ' pf-dark' : ''}${preview ? ' is-preview' : ''}${page.glass.on ? '' : ' pf-plain-panels'}`}
      style={{ '--a1': accent[0], '--a2': accent[1], '--r': `${T.radius}px`, '--maxw': `${T.maxWidth}px`, '--pf-blur': `${page.glass.on ? page.glass.blur : 0}px`, '--pf-shadow': page.glass.on ? page.glass.shadow / 100 : 0, '--pf-tint': page.glass.on ? (0.18 + page.glass.tint / 100 * 0.62) : 1, fontFamily: FONT_STACK[T.font], background: T.bg === 'color' ? T.bgColor : undefined }}>
      {T.bg === 'image' && data.bgImage && <div className="pf-backdrop" aria-hidden="true"><BackgroundLayer imageUrl={data.bgImage} bg={preview ? { ...data.bg, parallax: false } : data.bg} /><div className="pf-background-wash" style={{ opacity: T.wash / 100 }} /></div>}
      <header className="pf-head">
        <div className="pf-wrap pf-head-in">
          <GoTo to="home" ctx={ctx} className="pf-brand">{m.brand}</GoTo>
          <nav className="pf-nav" aria-label="Pages">{m.pages.map(p => <GoTo key={p.key} to={p.key} ctx={ctx} className={p.key === current ? 'on' : ''} aria-current={p.key === current ? 'page' : undefined}>{p.label}</GoTo>)}</nav>
          <div className="pf-head-act">
            {user && !preview && <Link className="pf-round" to="/admin" aria-label="Dashboard" title="Dashboard"><Icon n="briefcase" size={16} /></Link>}
            <A className="pf-btn dark sm" href={m.navCta.url}>{m.navCta.label} <Icon n="arrow" size={14} /></A>
          </div>
        </div>
      </header>

      <main>
        {current === 'home' ? (
          <>
            <Hero m={m} ctx={ctx} />
            <WhatsNew m={m} ctx={ctx} />
            <EventsHome m={m} ctx={ctx} />
            {m.featured && <ProjectsHome m={m} ctx={ctx} />}
            {m.products.length > 0 && <ProductsHome m={m} ctx={ctx} />}
          </>
        ) : current === 'chat' ? <Chat key={slug} m={m} ctx={ctx} data={data} /> : <Body m={m} ctx={ctx} />}
      </main>

      <footer className="pf-foot">
        <div className="pf-wrap pf-foot-in">
          <div><b className="pf-brand-sm">{m.brand}</b>{m.footerNote && <small>{m.footerNote}</small>}</div>
          {m.socials.length > 0 && <div className="pf-socials">{m.socials.map((s, i) => <A key={i} className="pf-soc" href={s.url} aria-label={SOCIAL_KINDS[s.kind]}><Icon n={s.kind} size={16} /></A>)}</div>}
          <small>© {new Date().getFullYear()} {m.name}</small>
        </div>
      </footer>
      {openProj && <ProjectModal x={openProj} onClose={() => setOpenProj(null)} />}
    </div>
    </GlassProvider>
  );
}
