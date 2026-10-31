// Per-user look of the public "personal AI" page. Shared by the settings page, the public page and the server.
export const BG_DEFAULTS = {
  x: 50, y: 50,          // focal point, % (what stays centred when the screen shape changes)
  zoom: 1,               // 1 to 3
  blur: 0,               // px, 0 to 24
  brightness: 100,       // %, 30 to 140
  dim: 35,               // dark overlay %, 0 to 85, keeps the text readable
  parallax: true,        // gentle movement with the pointer (off automatically for reduced motion)
  ball: true,            // show the dotted ball over the image
  ballOpacity: 100,      // %, 20 to 100
};
export const BG_LIMITS = { x: [0, 100], y: [0, 100], zoom: [1, 3], blur: [0, 24], brightness: [30, 140], dim: [0, 85], ballOpacity: [20, 100] };

const clamp = (v, [lo, hi], fallback) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback; };

/** Whatever comes in (database, browser), what comes out is always safe to render and store. */
export function normalizeBg(input) {
  const s = input && typeof input === 'object' ? input : {};
  const out = { ...BG_DEFAULTS };
  for (const k of Object.keys(BG_LIMITS)) out[k] = clamp(s[k], BG_LIMITS[k], BG_DEFAULTS[k]);
  out.parallax = typeof s.parallax === 'boolean' ? s.parallax : BG_DEFAULTS.parallax;
  out.ball = typeof s.ball === 'boolean' ? s.ball : BG_DEFAULTS.ball;
  return out;
}

export const BG_BUCKET = 'backgrounds';
