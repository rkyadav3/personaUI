import { Fragment, createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { PAGE_DEFAULTS } from '../../shared/pageSettings.js';
import { canRefract, glassMap } from '../lib/glassMap.js';
import '../styles/liquidGlass.css';

const Ctx = createContext({ ...PAGE_DEFAULTS.glass, dark: false });
export const GlassProvider = Ctx.Provider;
export const useGlass = () => useContext(Ctx);

const REFRACT = canRefract();

/** A pane of glass. Everything behind it is bent at the edge (Chrome / Edge), softened in the middle, with a lit rim.
 *  `refract` is for large surfaces only (each one carries its own filter); small pieces use the cheaper frosted look. */
export default function LiquidGlass({ as: Tag = 'div', radius, refract = false, className = '', style, children, ...rest }) {
  const g = useGlass(), uid = `lg${useId().replace(/:/g, '')}`, ref = useRef(null);
  const [box, setBox] = useState(null);
  const r = radius ?? 24;
  const want = g.on && refract && REFRACT && g.refraction > 0;

  useLayoutEffect(() => {
    if (!want || !ref.current) return undefined;
    const el = ref.current;
    const fit = () => setBox(b => { const w = el.offsetWidth, h = el.offsetHeight; return b && Math.abs(b.w - w) < 3 && Math.abs(b.h - h) < 3 ? b : { w, h }; });
    fit(); const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
  }, [want]);
  useEffect(() => { if (!want) setBox(null); }, [want]);

  const bezel = Math.max(10, Math.min(36, r * 1.1));
  const map = want && box ? glassMap(box.w, box.h, r, bezel) : null;
  const scale = bezel * (0.25 + (g.refraction / 100) * 1.35) * 2, disp = (g.dispersion / 100) * 0.12;
  const vars = {
    '--lg-r': `${r}px`, '--lg-blur': `${g.blur}px`, '--lg-a': (0.18 + (g.tint / 100) * 0.62).toFixed(2), '--lg-base': g.dark ? '18,18,34' : '255,255,255',
    '--lg-rim': g.on ? g.rim / 100 : 0, '--lg-sh': g.on ? g.shadow / 100 : 0.3,
    ...(map ? { backdropFilter: `url(#${uid}) saturate(1.35)`, WebkitBackdropFilter: `url(#${uid}) saturate(1.35)` } : null),
    ...style,
  };
  return (
    <>
      {map && (
        <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
          <filter id={uid} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feImage href={map} x="0" y="0" width={box.w} height={box.h} preserveAspectRatio="none" result="map" />
            <feGaussianBlur in="SourceGraphic" stdDeviation={Math.max(0.01, g.blur / 2.2)} result="soft" />
            {[['R', 1 + disp, '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'], ['G', 1, '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'], ['B', 1 - disp, '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0']].map(([c, m, mat]) => (
              <Fragment key={c}>
                <feDisplacementMap in="SourceGraphic" in2="map" scale={scale * m} xChannelSelector="R" yChannelSelector="G" result={`d${c}`} />
                <feColorMatrix in={`d${c}`} type="matrix" values={mat} result={`c${c}`} />
              </Fragment>
            ))}
            <feBlend in="cR" in2="cG" mode="screen" result="rg" />
            <feBlend in="rg" in2="cB" mode="screen" result="disp" />
            <feColorMatrix in="map" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0" result="mask" />
            <feComposite in="disp" in2="mask" operator="in" result="rim" />
            <feComposite in="soft" in2="mask" operator="out" result="mid" />
            <feMerge><feMergeNode in="mid" /><feMergeNode in="rim" /></feMerge>
          </filter>
        </svg>
      )}
      <Tag ref={ref} className={`lg${g.on ? '' : ' lg-off'}${g.dark ? ' lg-dark' : ''} ${className}`} style={vars} {...rest}>{children}</Tag>
    </>
  );
}
