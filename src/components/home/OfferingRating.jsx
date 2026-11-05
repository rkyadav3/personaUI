import { useState } from 'react';
import { StarInput } from '../Stars.jsx';
import { track } from '../../lib/track.js';
export default function OfferingRating({
  product,
  user,
  preview = false,
  onRated
}) {
  const [mine, setMine] = useState(() => {
    try {
      return Number(localStorage.getItem(`rating:${product.id}`)) || 0;
    } catch {
      return 0;
    }
  });
  const [stats, setStats] = useState({
    avg: product.ratingAvg || 0,
    count: product.ratingCount || 0
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  const own = user?.slug === product.slug;
  async function rate(stars) {
    if (busy || own || preview) return;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const result = await track({
        kind: 'rate',
        id: product.id,
        stars
      });
      if (!result?.ok || !Number.isFinite(result.avg) || !Number.isInteger(result.count)) throw new Error(result?.error || 'Could not save your rating. Please try again.');
      setMine(stars);
      setStats({
        avg: result.avg,
        count: result.count
      });
      setSaved(true);
      try {
        localStorage.setItem(`rating:${product.id}`, String(stars));
      } catch {/* Ratings still save when browser storage is unavailable. */}
      onRated?.(product, result);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }
  return <section className="directory-rating" aria-label="Rate this offering"><h3>Visitor reviews</h3><p>{stats.count ? `${stats.avg.toFixed(1)} / 5 · ${stats.count} ${stats.count === 1 ? 'rating' : 'ratings'}` : 'No ratings yet. Be the first to share your feedback.'}</p><StarInput mine={mine} onRate={rate} disabled={busy || own || preview} /><small>{preview ? 'Ratings are available on your live profile.' : own ? 'You cannot rate your own offering.' : 'Rate this offering. You can update your rating at any time.'}</small>{saved && <p role="status">Your rating was saved. Thank you!</p>}{error && <p role="alert" className="directory-error">{error}</p>}</section>;
}
