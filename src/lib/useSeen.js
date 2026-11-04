import { useEffect } from 'react';

/** Calls fire() once the element has been mostly on screen for a second (this is what counts as a "view"). */
export function useSeen(ref, enabled, fire) {
  useEffect(() => {
    if (!enabled || !ref.current || typeof IntersectionObserver === 'undefined') return undefined;
    let t;
    const io = new IntersectionObserver(([e]) => { clearTimeout(t); if (e.isIntersecting) t = setTimeout(() => { fire(); io.disconnect(); }, 1000); }, { threshold: 0.6 });
    io.observe(ref.current);
    return () => { clearTimeout(t); io.disconnect(); };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}
