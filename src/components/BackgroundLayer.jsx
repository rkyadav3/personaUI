import { useEffect, useRef } from 'react';
import { normalizeBg } from '../../shared/siteSettings.js';

/** The user's image with their adjustments. Fills its (positioned) parent. Used by the public page and the live preview. */
export default function BackgroundLayer({ imageUrl, bg: input }) {
  const bg = normalizeBg(input), img = useRef(null);

  // Gentle pointer parallax. Written straight to CSS variables (no React re-render) and off for reduced motion.
  useEffect(() => {
    const el = img.current;
    if (!el || !bg.parallax || matchMedia('(prefers-reduced-motion: reduce)').matches) { el?.style.setProperty('--px', '0px'); el?.style.setProperty('--py', '0px'); return; }
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const move = e => { tx = (e.clientX / innerWidth - 0.5) * -22; ty = (e.clientY / innerHeight - 0.5) * -16; if (!raf) raf = requestAnimationFrame(tick); };
    const tick = () => {
      cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
      el.style.setProperty('--px', `${cx.toFixed(2)}px`); el.style.setProperty('--py', `${cy.toFixed(2)}px`);
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.05 ? requestAnimationFrame(tick) : 0;
    };
    addEventListener('pointermove', move);
    return () => { removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
  }, [bg.parallax]);

  if (!imageUrl) return null;
  const grow = bg.parallax || bg.blur > 0 ? 1.07 : 1;   // a little extra size so blurred or moving edges never show
  return (
    <div className="bgl" aria-hidden="true">
      <div ref={img} className="bgl-img" style={{
        backgroundImage: `url("${imageUrl}")`, backgroundPosition: `${bg.x}% ${bg.y}%`, transformOrigin: `${bg.x}% ${bg.y}%`,
        transform: `translate3d(var(--px, 0px), var(--py, 0px), 0) scale(${(bg.zoom * grow).toFixed(3)})`,
        filter: `blur(${bg.blur}px) brightness(${bg.brightness}%)`,
      }} />
      <div className="bgl-dim" style={{ background: `rgba(6, 7, 10, ${bg.dim / 100})` }} />
    </div>
  );
}
