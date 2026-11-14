import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cleanImg, cleanUrl } from '../../../shared/portfolio.js';
import { minorUnits } from '../../../shared/commerce.js';
import { useSeen } from '../../lib/useSeen.js';
import { track } from '../../lib/track.js';
import Icon from '../portfolio/Icon.jsx';
import CheckoutDialog from './CheckoutDialog.jsx';
import OfferingRating from '../home/OfferingRating.jsx';
import { normalizeCustomization } from '../../../shared/customization.js';
import { sortDisplayItems } from '../../lib/customizationDisplay.js';
import '../../styles/profileActions.css';

export function ShopCard({ item, slug, user, preview, onCheckout, display = normalizeCustomization() }) {
  const ref = useRef(null), offering = item.kind === 'offering';
  const [badImage, setBadImage] = useState(false);
  useSeen(ref, !preview && offering, () => track({ kind: 'view', id: item.id }));
  let purchasable = !!item.checkout;
  if (item.pricing === 'paid') { try { minorUnits(item.amount, item.currency); } catch { purchasable = false; } }
  const unavailable = item.accessReady === false || !purchasable;
  const image = cleanImg(item.image), info = cleanUrl(item.url);
  return (
    <article className="persona-shop-card" ref={ref}>
      <div className="persona-shop-cover">
        {image && !badImage ? <img src={image} alt="" loading="lazy" onError={() => setBadImage(true)} /> : <span aria-hidden="true"><Icon n={item.icon || 'spark'} size={30} /></span>}
        {display.storeBadges && <span className="persona-tag">{item.pricing === 'free' ? 'Free' : item.pricing === 'paid' ? 'Paid' : item.status || 'Offering'}</span>}
      </div>
      <h3>{item.title}</h3>
      {display.storeDescriptions && item.summary && <p>{item.summary}</p>}
      <div className="persona-shop-footer">
        {display.storePrices && <strong>{item.price}</strong>}
        {item.checkout && <button type="button" className="persona-button primary" disabled={unavailable && !preview} onClick={() => { if (!preview && offering) track({ kind: 'click', id: item.id }); onCheckout(item); }}>{item.pricing === 'free' ? 'Get free' : 'Buy now'}</button>}
      </div>
      {item.ratingCount > 0 && <small className="persona-muted">★ {Number(item.ratingAvg || 0).toFixed(1)} ({item.ratingCount} ratings)</small>}
      {item.checkout && unavailable && <small className="persona-muted">{item.accessReady === false ? 'Delivery file coming soon' : 'Contact the owner for pricing'}</small>}
      {info && <a className="persona-info-link" href={info} {...(/^https?:\/\//i.test(info) ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}>{item.linkLabel && !item.checkout ? item.linkLabel : 'More details'} ↗</a>}
      {offering && slug && <details className="persona-rating-details"><summary>Rate this offering</summary><OfferingRating product={{ ...item, slug }} user={user} preview={preview} /></details>}
    </article>
  );
}

export default function Shop({ items, slug, owner, user, preview = false, customization, limit = 40 }) {
  const [selected, setSelected] = useState(null);
  const [category, setCategory] = useState('all'), [count, setCount] = useState(limit);
  useEffect(() => { setCount(limit); }, [limit]);
  const display = normalizeCustomization(customization);
  const categories = [...new Set(items.map(item => item.category || (item.kind === 'product' ? 'Products' : 'Offerings')))];
  const active = display.storeFilters && categories.includes(category) ? category : 'all';
  const sorted = sortDisplayItems(items.filter(item => active === 'all' || (item.category || (item.kind === 'product' ? 'Products' : 'Offerings')) === active), display.storeSort);
  return (
    <>
      {slug && !preview && <p className="persona-purchases-link"><Link to={`/p/${slug}/purchases`}>My purchases</Link></p>}
      {display.storeFilters && categories.length > 1 && <label className="pf-store-filter">Category<select value={active} onChange={event => { setCategory(event.target.value); setCount(limit); }}><option value="all">All items</option>{categories.map(name => <option key={name}>{name}</option>)}</select></label>}
      <div className={`persona-shop-grid shop-${display.storeLayout} shop-${display.storeCardSize} image-${display.storeImageRatio}`} style={{ '--store-columns': display.storeColumns }}>{sorted.slice(0, count).map(item => <ShopCard key={`${item.kind}:${item.id}`} item={item} slug={slug} user={user} preview={preview} onCheckout={setSelected} display={display} />)}</div>
      {sorted.length > count && <button type="button" className="pf-btn" onClick={() => setCount(value => value + limit)}>Show more items</button>}
      {selected && <CheckoutDialog key={`${selected.kind}:${selected.id}`} item={selected} slug={slug} owner={owner} preview={preview} onClose={() => setSelected(null)} />}
    </>
  );
}
