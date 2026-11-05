import { useRef, useState } from 'react';
import { cleanImg, cleanUrl } from '../../../shared/portfolio.js';
import { minorUnits } from '../../../shared/commerce.js';
import { useSeen } from '../../lib/useSeen.js';
import { track } from '../../lib/track.js';
import Icon from '../portfolio/Icon.jsx';
import CheckoutDialog from './CheckoutDialog.jsx';
import OfferingRating from '../home/OfferingRating.jsx';
import '../../styles/profileActions.css';

export function ShopCard({ item, slug, user, preview, onCheckout }) {
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
        <span className="persona-tag">{item.pricing === 'free' ? 'Free' : item.pricing === 'paid' ? 'Paid' : item.status || 'Offering'}</span>
      </div>
      <h3>{item.title}</h3>
      {item.summary && <p>{item.summary}</p>}
      <div className="persona-shop-footer">
        <strong>{item.price}</strong>
        {item.checkout && <button type="button" className="persona-button primary" disabled={unavailable && !preview} onClick={() => { if (!preview && offering) track({ kind: 'click', id: item.id }); onCheckout(item); }}>{item.pricing === 'free' ? 'Get free' : 'Buy now'}</button>}
      </div>
      {item.ratingCount > 0 && <small className="persona-muted">★ {Number(item.ratingAvg || 0).toFixed(1)} ({item.ratingCount} ratings)</small>}
      {item.checkout && unavailable && <small className="persona-muted">{item.accessReady === false ? 'Access link coming soon' : 'Contact the owner for pricing'}</small>}
      {info && <a className="persona-info-link" href={info} {...(/^https?:\/\//i.test(info) ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}>{item.linkLabel && !item.checkout ? item.linkLabel : 'More details'} ↗</a>}
      {offering && slug && <details className="persona-rating-details"><summary>Rate this offering</summary><OfferingRating product={{ ...item, slug }} user={user} preview={preview} /></details>}
    </article>
  );
}

export default function Shop({ items, slug, owner, user, preview = false }) {
  const [selected, setSelected] = useState(null);
  return (
    <>
      <div className="persona-shop-grid">{items.map(item => <ShopCard key={`${item.kind}:${item.id}`} item={item} slug={slug} user={user} preview={preview} onCheckout={setSelected} />)}</div>
      {selected && <CheckoutDialog key={`${selected.kind}:${selected.id}`} item={selected} slug={slug} owner={owner} preview={preview} onClose={() => setSelected(null)} />}
    </>
  );
}
