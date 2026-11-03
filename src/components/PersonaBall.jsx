import { useEffect, useRef } from 'react';

const N_POINTS = 900;
const VOWEL = { a: 1, o: 1, u: 0.75, e: 0.65, i: 0.55 };
export const amp = c => {
  const l = (c || '').toLowerCase();
  if (VOWEL[l]) return VOWEL[l];
  if ('bmp'.includes(l)) return 0.2;
  return /[a-z]/.test(l) ? 0.42 : 0.1;
};

/**
 * 3D Dotted Persona Particle Ball:
 * An interactive 3D particle sphere that rotates, illuminates, and reacts to speech/voice energy.
 */
export default function PersonaBall({
  mode = 'idle',
  impulse = 0,
  width = 250,
  height = 250,
  className = '',
  dotColor = [99, 102, 241],     // Indigo #6366f1
  glowColor = [168, 85, 247],    // Purple #a855f7
  lightTheme = true,
}) {
  const cv = useRef(null);
  const S = useRef({ mode, energy: 0, impulse: 0, t: 0, light: 0 });

  useEffect(() => {
    S.current.mode = mode;
  }, [mode]);

  useEffect(() => {
    if (impulse > 0) {
      S.current.impulse = Math.max(S.current.impulse, impulse);
    }
  }, [impulse]);

  useEffect(() => {
    const canvas = cv.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Distribute points evenly over a 3D sphere using spherical Fibonacci spiral
    const pts = Array.from({ length: N_POINTS }, (_, i) => {
      const y = 1 - ((i + 0.5) / N_POINTS) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = i * 2.399963229728653;
      return { x: Math.cos(th) * r, y, z: Math.sin(th) * r, s: Math.random() };
    });

    let raf, last = performance.now();

    function render(now) {
      if (document.hidden) {
        last = now;
        raf = requestAnimationFrame(render);
        return;
      }

      const s = S.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      s.t += dt;

      // Energy chases impulse with exponential decay
      s.energy += (s.impulse - s.energy) * 0.28;
      s.impulse *= 0.88;

      let base = 0.06, speed = 0.4;
      if (s.mode === 'thinking') {
        base = 0.22 + 0.1 * Math.sin(s.t * 6);
        speed = 2.0;
      } else if (s.mode === 'talking') {
        speed = 0.8 + s.energy * 2.4;
      } else if (s.mode === 'listening') {
        base = 0.12;
        speed = 0.6;
      }

      const e = Math.max(s.energy, base);
      s.light += dt * speed * (reduce ? 0.4 : 1);

      // Light vector roams across sphere
      let lx = Math.cos(s.light) * 0.9;
      let ly = Math.sin(s.light * 0.8) * 0.55;
      let lz = 0.65 + 0.3 * Math.sin(s.light * 0.5);
      const ll = Math.hypot(lx, ly, lz);
      lx /= ll; ly /= ll; lz /= ll;

      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) * 0.38;

      // Soft ambient glow
      const gx = cx + lx * R * 0.5;
      const gy = cy + ly * R * 0.5;
      const gr = R * (1.1 + e * 0.4);
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);

      if (lightTheme) {
        g.addColorStop(0, `rgba(${glowColor[0]},${glowColor[1]},${glowColor[2]},${0.18 + e * 0.25})`);
        g.addColorStop(0.6, `rgba(${dotColor[0]},${dotColor[1]},${dotColor[2]},${0.06 + e * 0.1})`);
        g.addColorStop(1, `rgba(${glowColor[0]},${glowColor[1]},${glowColor[2]},0)`);
      } else {
        g.addColorStop(0, `rgba(${glowColor[0]},${glowColor[1]},${glowColor[2]},${0.25 + e * 0.3})`);
        g.addColorStop(1, `rgba(${glowColor[0]},${glowColor[1]},${glowColor[2]},0)`);
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // 3D Rotation matrices
      const rot = reduce ? 0.5 : s.t * 0.16;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      const tilt = 0.34, ct = Math.cos(tilt), st = Math.sin(tilt);

      for (let i = 0; i < N_POINTS; i++) {
        const p = pts[i];
        const x1 = p.x * cr + p.z * sr;
        const z1 = -p.x * sr + p.z * cr;
        const y2 = p.y * ct - z1 * st;
        const z2 = p.y * st + z1 * ct;

        const depth = (z2 + 1) / 2; // 0 (back) to 1 (front)

        // Speech wave ripple through the sphere surface
        const wob = 1 + e * 0.08 * Math.sin(p.y * 8 + s.t * 14 + p.s * 6);
        const lit = Math.max(0, x1 * lx + y2 * ly + z2 * lz);
        const bright = Math.min(1, 0.12 + Math.pow(lit, 2.2) * (0.8 + e * 1.4) + 0.08 * (1 - depth));
        const sc = (0.88 + 0.24 * depth) * wob;
        const rad = (0.8 + 1.8 * bright) * dpr * (0.6 + 0.5 * depth);

        // Interpolate between dotColor and glowColor
        const rVal = Math.round(dotColor[0] + (glowColor[0] - dotColor[0]) * bright);
        const gVal = Math.round(dotColor[1] + (glowColor[1] - dotColor[1]) * bright);
        const bVal = Math.round(dotColor[2] + (glowColor[2] - dotColor[2]) * bright);
        const alpha = Math.min(1, Math.max(0.15, 0.2 + 0.8 * bright * (0.4 + 0.6 * depth))).toFixed(3);

        ctx.fillStyle = `rgba(${rVal},${gVal},${bVal},${alpha})`;
        ctx.beginPath();
        ctx.arc(cx + x1 * R * sc, cy + y2 * R * sc, Math.max(0.5, rad), 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(render);
    }

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [dotColor, glowColor, lightTheme]);

  return (
    <canvas
      ref={cv}
      width={width * (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1)}
      height={height * (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1)}
      style={{ width, height, display: 'block', maxWidth: '100%', pointerEvents: 'none' }}
      className={className}
      aria-hidden="true"
    />
  );
}

