import { useState } from 'react';

/** Read-only stars filled to `value` (0 to 5), with the vote count beside them. */
export function Stars({ value = 0, count = 0, showEmpty = false }) {
  if (!count && !showEmpty) return null;
  return (
    <span className="stars-wrap" title={count ? `${value} out of 5 from ${count} ${count === 1 ? 'rating' : 'ratings'}` : 'No ratings yet'}>
      <span className="stars" style={{ '--p': `${Math.min(100, (value / 5) * 100)}%` }} aria-hidden="true">★★★★★</span>
      <span className="sr">{count ? `${value} out of 5` : 'No ratings yet'}</span>
      <small>{count ? `${value.toFixed(1)} (${count})` : 'No ratings yet'}</small>
    </span>
  );
}

/** Five buttons. `mine` is what this visitor gave before (0 = nothing yet). */
export function StarInput({ mine = 0, onRate, disabled }) {
  const [hover, setHover] = useState(0), shown = hover || mine;
  return (
    <span className="star-input" role="group" aria-label="Rate this" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" disabled={disabled} className={n <= shown ? 'on' : ''} aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={n === mine}
          onMouseEnter={() => setHover(n)} onFocus={() => setHover(n)} onBlur={() => setHover(0)} onClick={() => onRate(n)}>★</button>
      ))}
    </span>
  );
}
