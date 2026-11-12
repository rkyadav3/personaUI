import { Loading } from '../components/Ui.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { compact, initials } from '../lib/ui.js';
import { directoryModel, checkoutItem, applyHomeRating } from '../lib/homeDirectory.js';
import { fmtPrice } from '../lib/money.js';
import { track } from '../lib/track.js';
import { useSeen } from '../lib/useSeen.js';
import Icon from '../components/portfolio/Icon.jsx';
import ProductDialog from '../components/home/ProductDialog.jsx';
import AccountMenu from '../components/AccountMenu.jsx';
import { normalizeHomeSettings } from '../../shared/homeSettings.js';
import { tagLabel } from '../../shared/governance.js';
import CheckoutDialog from '../components/commerce/CheckoutDialog.jsx';
import '../styles/home.css';
import '../styles/governance.css';
function ProfileTags({ tags, definitions }) {
  return tags?.length ? <div className="governance-tags" aria-label="Profile tags">{tags.filter(tag => tag !== 'private').map(tag => <span className={`governance-tag ${tag}`} key={tag}>{tagLabel(tag, definitions)}</span>)}</div> : null;
}
function Arrow({
  back = false,
  size = 18
}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={back ? 'M19 12H5M11 6l-6 6 6 6' : 'M5 12h14M13 6l6 6-6 6'} /></svg>;
}
function Star({
  size = 19
}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z" /></svg>;
}
function Eye({
  size = 20
}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>;
}
function Portrait({
  member,
  featured = false
}) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [member.photo]);
  const focus = member.photoFocus || {
    x: 50,
    y: 50,
    zoom: 1
  };
  return <div className={featured ? 'directory-portrait featured' : 'directory-portrait'} aria-hidden="true">{member.photo && !bad ? <img src={member.photo} alt="" loading={featured ? 'eager' : 'lazy'} onError={() => setBad(true)} style={{
      objectPosition: `${focus.x}% ${focus.y}%`,
      transform: `scale(${featured ? 1 : focus.zoom || 1})`
    }} /> : <span>{initials(member.name)}</span>}</div>;
}
export function FeaturedProfile({
  member, tagDefinitions
}) {
  return <article className="directory-feature" aria-label="Featured professional"><Portrait member={member} featured /><div className="directory-feature-copy"><span className="directory-feature-badge"><Star size={13} />{member.ratingCount > 0 ? 'Top Rated Creator' : 'Featured Creator'}</span><h2>{member.name}</h2><ProfileTags tags={member.tags} definitions={tagDefinitions} />{member.designation && <p className="directory-role">{member.designation}</p>}{member.purpose && <p className="directory-bio">{member.purpose}</p>}{!!member.expertise?.length && <ul className="directory-tags" aria-label="Expertise">{member.expertise.slice(0, 4).map(skill => <li key={skill}>{skill}</li>)}</ul>}</div>
    <div className="directory-feature-stats"><div className="directory-stat"><Star /><div><strong>{member.ratingCount > 0 ? Number(member.ratingAvg).toFixed(1) : 'New'}</strong>{member.ratingCount > 0 && <span> / 5</span>}<small>{member.ratingCount || 0} offering reviews</small></div></div><div className="directory-stat"><Eye /><div><strong>{compact(member.views)}</strong><small>profile views</small></div></div><div className="directory-stat"><Icon n="chat" size={21} /><div><strong>{compact(member.engagements)}</strong><small>offering interactions</small></div></div><Link className="directory-profile-cta" to={`/p/${member.slug}`}>View Profile <Arrow size={16} /></Link></div>
  </article>;
}
export function ProfileCard({
  member,
  first, tagDefinitions
}) {
  return <Link className={`directory-profile-card${first ? ' first' : ''}`} to={`/p/${member.slug}`} aria-label={`View ${member.name}’s profile`}><Portrait member={member} /><h3>{member.name}</h3><ProfileTags tags={member.tags} definitions={tagDefinitions} /><p>{member.expertise?.slice(0, 3).join(' · ') || member.designation || 'Explore their profile'}</p><div className="directory-card-stats"><span title={`${member.ratingCount || 0} offering reviews`}><Star size={13} />{member.ratingCount > 0 ? Number(member.ratingAvg).toFixed(1) : 'New'}</span><span title="Profile views"><Eye size={14} />{compact(member.views)}</span><span title="Offering interactions"><Icon n="chat" size={13} />{compact(member.engagements)}</span></div></Link>;
}
function ProductCover({
  product
}) {
  const [bad, setBad] = useState(false);
  const icon = product.icon || (product.typeLabel === 'Book' ? 'book' : ['Course', 'Video'].includes(product.typeLabel) ? 'play' : product.typeLabel === '1:1 Talk' || product.typeLabel === 'Consultation' ? 'calendar' : 'box');
  return <span className={`directory-product-cover ${icon}`}>{product.image && !bad ? <img src={product.image} alt="" loading="lazy" onError={() => setBad(true)} /> : <Icon n={icon} size={29} />}</span>;
}
export function ProductRow({
  product,
  onOpen, preview
}) {
  const ref = useRef(null);
  useSeen(ref, !preview && (product.kind || 'offering') === 'offering', () => track({
    kind: 'view',
    id: product.id
  }));
  return <button type="button" className="directory-product-row" ref={ref} onClick={() => onOpen(product)} aria-label={`View ${product.title}`}><ProductCover product={product} /><span className="directory-product-copy"><span className="directory-type">{product.typeLabel || product.category || 'Product'}</span><strong>{product.title}</strong>{product.description && <span className="directory-product-summary">{product.description}</span>}<b>{fmtPrice(product) || 'Contact for details'}</b></span><span className="directory-product-arrow"><Arrow size={15} /></span></button>;
}
export function HomeDirectory({
  feed,
  error,
  user,
  onRetry,
  onRated,
  onLogout, preview = false
}) {
  const settings = useMemo(() => normalizeHomeSettings(feed?.settings), [feed?.settings]);
  const brand = settings.siteName || feed?.name || 'Persona';
  const [query, setQuery] = useState(''),
    [sort, setSort] = useState(settings.defaultSort),
    [showAll, setShowAll] = useState(false),
    [selected, setSelected] = useState(null);
  const search = useRef(null),
    profiles = useRef(null);
  const model = useMemo(() => directoryModel(feed || {}, {
    query,
    sort
  }), [feed, query, sort]);
  useEffect(() => setSort(settings.defaultSort), [settings.defaultSort]);
  const shownProducts = showAll ? model.products : model.products.slice(0, 4);
  function nudge(back) {
    const rail = profiles.current;
    if (rail) rail.scrollBy({
      left: (back ? -1 : 1) * Math.max(200, rail.clientWidth * .85),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  }
  function openProduct(product) {
    setSelected({
      product,
      phase: 'details'
    });
  }
  function checkout(item) {
    if ((item.kind || 'offering') === 'offering') track({
      kind: 'click',
      id: item.id
    });
    setSelected({
      product: selected.product,
      item,
      phase: 'checkout'
    });
  }
  return <div className="directory" onClickCapture={event => { if (preview && event.target.closest('a,button')) { event.preventDefault(); event.stopPropagation(); } }} style={{ '--dir-green': settings.accent, '--dir-background': settings.background }}><a className="directory-skip" href="#directory-content">Skip to profiles</a><header className="directory-header"><Link to="/" className="directory-brand" aria-label={`${brand} home`}>{brand}<span /></Link><nav aria-label="Account"><button type="button" className="directory-round search" aria-label="Focus profile search" onClick={() => search.current?.focus()}><Icon n="search" size={21} /></button><AccountMenu user={user} onLogout={onLogout} /></nav></header>
    <section className="directory-intro" aria-labelledby="directory-heading"><p className="directory-eyebrow"><span aria-hidden="true">❧</span> {settings.eyebrow} <span aria-hidden="true">❧</span></p><h1 id="directory-heading">{settings.headline} <em>{settings.highlight}</em> {settings.headlineEnd}</h1><p className="directory-intro-sub">{settings.subtitle}</p><form className="directory-search" role="search" onSubmit={event => {
        event.preventDefault();
        document.getElementById('directory-content')?.focus();
      }}><Icon n="search" size={21} /><input ref={search} type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search profiles, expertise, or industries" placeholder={settings.searchPlaceholder} />{query && <button type="button" className="directory-clear" onClick={() => {
          setQuery('');
          search.current?.focus();
        }} aria-label="Clear search">×</button>}<button type="submit" className="directory-search-go" aria-label="Search directory"><Arrow size={19} /></button></form></section>
    <main id="directory-content" className="directory-content" tabIndex={-1}>{error ? <div className="directory-load-error"><p role="alert">{error}</p><button className="directory-buy" onClick={onRetry}>Retry</button></div> : !feed ? <Loading label="Loading profiles and products…" /> : <>{model.filtering && <div className="directory-results" role="status">{model.members.length} {model.members.length === 1 ? 'profile' : 'profiles'} and {model.products.length} {model.products.length === 1 ? 'product' : 'products'} matching “{query.trim()}”</div>}<div className={`directory-columns${settings.showProducts ? '' : ' profiles-only'}`}><div className="directory-people">{settings.showFeatured && model.featured && <FeaturedProfile tagDefinitions={feed.tagDefinitions} member={model.featured} />}<section className="directory-profiles" aria-labelledby="directory-profiles-heading"><div className="directory-section-head"><div><h2 id="directory-profiles-heading">{model.filtering ? 'Matching Profiles' : settings.profilesTitle || (model.hasReviews ? 'Top Rated Profiles' : 'Featured Profiles')}</h2><p>{settings.profilesDescription || (model.hasReviews ? 'Professionals ranked by visitor reviews of their offerings.' : 'Explore published profiles and discover what they offer.')}</p></div><div className="directory-carousel-controls"><button type="button" className="directory-round" disabled={model.members.length < 2} onClick={() => nudge(true)} aria-label="Previous profiles"><Arrow back size={17} /></button><button type="button" className="directory-round" disabled={model.members.length < 2} onClick={() => nudge(false)} aria-label="Next profiles"><Arrow size={17} /></button></div></div>{model.members.length ? <div className="directory-profile-rail" ref={profiles}>{model.members.map((member, index) => <ProfileCard tagDefinitions={feed.tagDefinitions} member={member} first={!index} key={member.slug} />)}</div> : <div className="directory-empty">{model.filtering ? 'No profiles match your search. Try another name, expertise or industry.' : 'No published profiles yet. Profiles appear here when their owners publish them.'}</div>}{model.members.length > 1 && <label className="directory-sort">Sort profiles <select value={sort} onChange={event => setSort(event.target.value)}><option value="rated">Top rated</option><option value="views">Most viewed</option><option value="new">Newest</option><option value="name">Name A–Z</option></select></label>}</section></div>{settings.showProducts && <aside className="directory-products" aria-labelledby="directory-products-heading"><div className="directory-products-head"><h2 id="directory-products-heading">{model.filtering ? 'Matching Products' : settings.productsTitle}</h2><button type="button" onClick={() => setShowAll(value => !value)} aria-label="Browse products" aria-expanded={showAll}>{showAll ? 'Show less' : 'View All'} <Arrow size={13} /></button></div><div className="directory-product-list">{shownProducts.map(product => <ProductRow key={`${product.slug}:${product.kind || 'offering'}:${product.id}`} product={product} preview={preview} onOpen={openProduct} />)}</div>{!shownProducts.length && <p className="directory-empty">{model.filtering ? 'No products match this search.' : 'Published products and offerings will appear here.'}</p>}</aside>}</div></>}</main>
    <footer className="directory-footer"><span>{brand} · {settings.footer}</span>{settings.showInviteLink && feed?.mode === 'invite' && <Link to="/invite">Join with an invitation <Arrow size={14} /></Link>}</footer>{selected?.phase === 'details' && <ProductDialog product={selected.product} user={user} onClose={() => setSelected(null)} onCheckout={checkout} onRated={onRated} />}{selected?.phase === 'checkout' && <CheckoutDialog key={`${selected.product.slug}:${selected.product.id}`} item={selected.item || checkoutItem(selected.product)} slug={selected.product.slug} owner={selected.product.member} onClose={() => setSelected(null)} />}
  </div>;
}
export default function Home() {
  const {
      user
    } = useAuth() || {},
    [feed, setFeed] = useState(null),
    [error, setError] = useState(''),
    [version, setVersion] = useState(0),
    [draftSettings, setDraftSettings] = useState(null);
  const previewRequested = new URLSearchParams(window.location.search).get('preview') === 'main-site' && window.parent !== window;
  const preview = previewRequested && user?.isSuperAdmin;
  useEffect(() => {
    if (!preview) return;
    const draft = event => { if (event.origin === window.location.origin && event.source === window.parent && event.data?.type === 'persona-home-draft') setDraftSettings(normalizeHomeSettings(event.data.settings)); };
    window.addEventListener('message', draft); window.parent.postMessage({ type: 'persona-home-ready' }, window.location.origin);
    return () => window.removeEventListener('message', draft);
  }, [preview]);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    fetch('/api/home', {
      signal: controller.signal
    }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load profiles.');
      return data;
    }).then(data => {
      if (!controller.signal.aborted) {
        setFeed(data);
        document.title = `${data.name || 'Persona'} · Discover professionals`;
      }
    }, failure => {
      if (!controller.signal.aborted) setError(failure.message || 'Could not load profiles.');
    });
    return () => controller.abort();
  }, [version]);
  function rated(product, result) {
    setFeed(current => applyHomeRating(current, product, result));
  }
  return <HomeDirectory preview={previewRequested} feed={feed && draftSettings && preview ? { ...feed, settings: draftSettings } : feed} error={error} user={user} onRetry={() => setVersion(value => value + 1)} onRated={rated} />;
}
