import { useId } from 'react';
import { Link } from 'react-router-dom';
import { minorUnits } from '../../../shared/commerce.js';
import { cleanUrl } from '../../../shared/portfolio.js';
import { checkoutItem } from '../../lib/homeDirectory.js';
import { track } from '../../lib/track.js';
import Dialog from '../commerce/Dialog.jsx';
import OfferingRating from './OfferingRating.jsx';
import { readReceipt } from '../../lib/publicActions.js';

export function ProductDetails({ product, user, onCheckout, onRated, titleId }) {
  const item = checkoutItem(product), info = cleanUrl(product.link);
  const contactPath = product.contactPath || `/p/${product.slug}/contact`;
  const enquire = () => {
    if ((product.kind || 'offering') === 'offering') track({ kind: 'click', id: product.id });
  };
  let available = !!item.checkout && product.accessReady === true && product.quantity !== 0;
  const hasReceipt = item.checkout && !!readReceipt(product.slug, item.checkout);
  if (available && item.pricing === 'paid') {
    try { minorUnits(item.amount, item.currency); } catch { available = false; }
  }
  return (
    <div className="directory-product-detail">
      <span className="directory-type">{product.typeLabel || product.category || 'Product'}</span>
      <h2 id={titleId}>{product.title}</h2>
      {product.description && <p>{product.description}</p>}
      <strong className="directory-detail-price">{item.price || 'Contact for details'}</strong>
      {product.quantity != null && <p className="directory-muted">{product.quantity === 0 ? 'Sold out' : `${product.quantity} available`}</p>}
      <div className="directory-detail-actions">
        {available || hasReceipt ? (
          <button type="button" className="directory-buy" onClick={() => onCheckout(item)}>{hasReceipt ? 'View purchase' : product.pricing === 'free' ? 'Get free' : 'Buy now'}</button>
        ) : (
          <>
            <p className="directory-muted">{product.accessReady === false ? 'Access link coming soon' : 'Contact the creator for access and pricing.'}</p>
            <Link className="directory-buy" to={contactPath} onClick={enquire}>{contactPath.endsWith('/chat') ? 'Ask about this' : 'Contact creator'}</Link>
          </>
        )}
        <Link className="directory-detail-link" to={`/p/${product.slug}`}>View {product.member || 'creator'}’s profile →</Link>
        {info && <a className="directory-detail-link" href={info} {...(/^https?:\/\//i.test(info) ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}>More information ↗</a>}
      </div>
      {(product.kind || 'offering') === 'offering' && <OfferingRating product={product} user={user} onRated={onRated} />}
    </div>
  );
}

export default function ProductDialog(props) {
  const titleId = useId();
  return <Dialog titleId={titleId} onClose={props.onClose} closeLabel="Close product details"><ProductDetails {...props} titleId={titleId} /></Dialog>;
}
