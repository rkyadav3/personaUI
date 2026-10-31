import { useEffect, useRef, useState } from 'react';
import 'open-glass-ui/styles.css';
import { Glass, GlassSystemProvider } from 'open-glass-ui';
import { Link, useParams } from 'react-router-dom';
import Offers from '../components/Offers.jsx';
import BackgroundLayer from '../components/BackgroundLayer.jsx';
import { api } from '../lib/api.js';

const N_DESKTOP = 1100, N_MOBILE = 650;   // fewer dots on phones: smoother and cooler
const VOWEL = { a: 1, o: 1, u: 0.75, e: 0.65, i: 0.55 };
const amp = c => { const l = c.toLowerCase(); if (VOWEL[l]) return VOWEL[l]; if ('bmp'.includes(l)) return 0.2; return /[a-z]/.test(l) ? 0.42 : 0.1; };
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

/** The public page: a dotted ball that "speaks" the answer. Colours are four CSS variables on .ball in styles.css. */
export default function Ball() {
  const { slug } = useParams();
  const root = useRef(null), cv = useRef(null), input = useRef(null), typer = useRef(null);
  const S = useRef({ mode: 'idle', energy: 0, impulse: 0, t: 0, light: 0 });   // how "alive" the ball is
  const [caption, setCaption] = useState(''), [sources, setSources] = useState([]), [busy, setBusy] = useState(true);
  const busyRef = useRef(true);
  const [site, setSite] = useState({ imageUrl: null, bg: null, offers: [], hasProfile: false, handle: null, name: null, contact: null, mode: 'open' });   // the owner's background image and look
  useEffect(() => {
    fetch(`/api/site${slug ? `?slug=${encodeURIComponent(slug)}` : ''}`).then(r => r.json())
      .then(d => { setSite(s => ({ ...s, ...d, offers: d.offers || [] })); S.current.hidden = d.bg ? d.bg.ball === false : false; }, () => {});
  }, [slug]);
  const [user, setUser] = useState(null), [open, setOpen] = useState(false);   // drives Sign in / Dashboard; open = offers panel
  useEffect(() => {   // not needed to draw the page, so it waits a moment instead of competing with it
    const t = setTimeout(() => api('auth.me').then(m => setUser(m.user), () => {}), 900);
    return () => clearTimeout(t);
  }, []);
  const lock = v => { busyRef.current = v; setBusy(v); };

  const kick = v => { S.current.impulse = Math.max(S.current.impulse, v); };

  // ---- the ball: points spread evenly over a sphere ----
  useEffect(() => {
    document.documentElement.classList.add('ball-lock');
    const canvas = cv.current, ctx = canvas.getContext('2d');
    const N = matchMedia('(max-width: 700px)').matches ? N_MOBILE : N_DESKTOP;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const css = n => getComputedStyle(root.current).getPropertyValue(n).trim();
    const DIM = hex(css('--dot')), GLOW = hex(css('--glow'));
    const pts = Array.from({ length: N }, (_, i) => {
      const y = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963229728653;
      return { x: Math.cos(th) * r, y, z: Math.sin(th) * r, s: Math.random() };
    });
    let W, H, dpr, R, cx, cy, raf, last = performance.now();
    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      W = canvas.width = innerWidth * dpr; H = canvas.height = innerHeight * dpr;
      R = Math.max(90 * dpr, Math.min(W * 0.30, H * 0.25)); cx = W / 2; cy = H * 0.38;
    };
    addEventListener('resize', resize); resize();

    function frame(now) {
      // nothing to draw in a background tab, or when the owner turned the ball off
      if (document.hidden || S.current.hidden) { if (S.current.hidden) ctx.clearRect(0, 0, W, H); last = now; raf = requestAnimationFrame(frame); return; }
      const s = S.current, dt = Math.min(0.05, (now - last) / 1000); last = now; s.t += dt;
      // energy chases the impulse, and the impulse fades like a voice trailing off
      s.energy += (s.impulse - s.energy) * 0.28; s.impulse *= 0.88;
      let base = 0.05, speed = 0.35;
      if (s.mode === 'thinking') { base = 0.16 + 0.08 * Math.sin(s.t * 5); speed = 1.7; }
      if (s.mode === 'talking') speed = 0.7 + s.energy * 2.2;
      if (s.mode === 'listening') { base = 0.1; speed = 0.5; }
      const e = Math.max(s.energy, base), t = s.t;
      s.light += dt * speed * (reduce ? 0.4 : 1);

      // the light roams over the surface
      let lx = Math.cos(s.light) * 0.9, ly = Math.sin(s.light * 0.8) * 0.55, lz = 0.65 + 0.3 * Math.sin(s.light * 0.5);
      const ll = Math.hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;

      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      // soft glow that follows the light
      const gx = cx + lx * R * 0.7, gy = cy + ly * R * 0.7, gr = R * (1.0 + e * 0.5);
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      g.addColorStop(0, `rgba(${GLOW},${0.16 + e * 0.30})`); g.addColorStop(1, `rgba(${GLOW},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      const rot = reduce ? 0.5 : t * 0.12, cr = Math.cos(rot), sr = Math.sin(rot), tilt = 0.32, ct = Math.cos(tilt), st = Math.sin(tilt);
      for (let i = 0; i < N; i++) {
        const p = pts[i];
        const x1 = p.x * cr + p.z * sr, z1 = -p.x * sr + p.z * cr;
        const y2 = p.y * ct - z1 * st, z2 = p.y * st + z1 * ct;                 // unit normal = (x1, y2, z2)
        const depth = (z2 + 1) / 2;                                              // 0 back .. 1 front
        const wob = 1 + e * 0.07 * Math.sin(p.y * 7 + t * 13 + p.s * 6);         // speech ripples through the surface
        const lit = Math.max(0, x1 * lx + y2 * ly + z2 * lz);
        const bright = Math.min(1, 0.12 + Math.pow(lit, 2.2) * (0.75 + e * 1.3) + 0.08 * (1 - depth));
        const sc = (0.85 + 0.25 * depth) * wob, k = Math.pow(bright, 1.2);
        const rad = (0.7 + 1.9 * bright) * dpr * (0.6 + 0.5 * depth);
        ctx.fillStyle = `rgba(${DIM[0] + (GLOW[0] - DIM[0]) * k | 0},${DIM[1] + (GLOW[1] - DIM[1]) * k | 0},${DIM[2] + (GLOW[2] - DIM[2]) * k | 0},${(0.14 + 0.86 * bright * (0.4 + 0.6 * depth)).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(cx + x1 * R * sc, cy + y2 * R * sc, rad, 0, 6.2832); ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); document.documentElement.classList.remove('ball-lock'); };
  }, []);

  // ---- the ball "speaks": the reply types out and each letter drives the light ----
  function speak(text, srcs) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    clearInterval(typer.current); setCaption(''); setSources([]); S.current.mode = 'talking';
    let i = 0;
    typer.current = setInterval(() => {
      const c = text[i++] || '';
      setCaption(text.slice(0, i)); kick(amp(c) * (0.8 + Math.random() * 0.4));
      if (i >= text.length) {
        clearInterval(typer.current);
        S.current.mode = input.current?.value ? 'listening' : 'idle'; lock(false);
        if (srcs?.length) setSources(srcs.slice(0, 4));
      }
    }, reduce ? 12 : 34);
  }

  useEffect(() => {
    const hello = setTimeout(() => { lock(true); speak('Hi. Ask me anything about my research.', []); }, 700);
    if (matchMedia('(hover: hover)').matches) input.current?.focus();
    return () => { clearTimeout(hello); clearInterval(typer.current); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the ball reacts while you type ----
  function onInput() {
    kick(0.3); S.current.light += 0.5;
    const m = S.current.mode;
    if (m === 'idle' || m === 'listening') S.current.mode = input.current.value ? 'listening' : 'idle';
  }
  const onBlur = () => { if (S.current.mode === 'listening') S.current.mode = 'idle'; };

  function ask(o) {   // put the question in the box so the visitor can send it (or change it) straight away
    setOpen(false);
    if (input.current) { input.current.value = `Tell me more about "${o.title}"`; input.current.focus(); onInput(); }
  }

  async function submit(e) {
    e.preventDefault();
    const q = input.current.value.trim();
    if (!q || busyRef.current) return;
    lock(true); input.current.value = ''; setSources([]); clearInterval(typer.current); setCaption(''); S.current.mode = 'thinking'; kick(0.4);
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: q, slug }) });
      const d = await r.json();
      speak(d.reply || d.error || 'Something went wrong. Try again.', d.sources);
    } catch {
      speak("I can't reach my notes right now. Try again in a moment.", []);
    }
  }

  return (
    <GlassSystemProvider renderer="auto" theme={{ appearance: 'dark' }}>
    <div className="ball" ref={root}>
      <BackgroundLayer imageUrl={site.imageUrl} bg={site.bg} />
      <canvas ref={cv} aria-hidden="true" style={{ opacity: site.bg ? site.bg.ballOpacity / 100 : 1 }} />
      <Glass as="nav" material="regular" className="ball-nav" aria-label="Account">
        <Link to="/">All members</Link>
        {site.hasProfile && site.handle && <Link to={`/p/${site.handle}`}>{site.name ? `${site.name.split(' ')[0]}'s profile` : 'Profile'}</Link>}
        {user ? <Link to="/admin">Dashboard</Link> : <>
          <Link to="/admin">Sign in</Link>
          {site.mode !== 'closed' && <Link to="/admin?tab=register" className="cta">Create account</Link>}
        </>}
      </Glass>
      {site.offers.length > 0 && !open && (
        <button className="offers-fab" onClick={() => setOpen(true)} aria-haspopup="dialog">
          <span>What {site.name ? site.name.split(' ')[0] : 'I'} offer{site.name ? 's' : ''}</span><b>{site.offers.length}</b>
        </button>
      )}
      {open && <Offers name={site.name} offers={site.offers} contact={site.contact} onAsk={ask} onClose={() => setOpen(false)} />}
      <div className="ui">
        <p className="caption" aria-live="polite">{caption}</p>
        <p className={`sources${sources.length ? ' on' : ''}`}>{sources.length ? `From my notes: ${sources.join(' · ')}` : ''}</p>
        <Glass as="div" material="regular" className="ball-form">
        <form onSubmit={submit} autoComplete="off">
          <input ref={input} maxLength={500} placeholder="Ask me anything about my research" aria-label="Your question" enterKeyHint="send" onInput={onInput} onBlur={onBlur} />
          <button disabled={busy} aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button>
        </form>
        </Glass>
      </div>
    </div>
    </GlassSystemProvider>
  );
}
