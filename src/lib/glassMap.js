// Liquid-glass refraction for the web, after the approach in github.com/shayann07/liquidglass (Kotlin/AGSL, Apache-2.0):
// the element is a signed-distance field; a bevel (superellipse height) bends the backdrop by the exact Snell deviation;
// the rim is sharp while the interior is softened. This file only makes the displacement map; the filter is in LiquidGlass.jsx.
//   R, G = sideways / vertical displacement (128 = none)      B = "rim weight" (1 at the edge, 0 in the flat middle)
const cache = new Map();
const N = 1.5;                                  // index of refraction (glass)
const MAX_SIDE = 640;                           // map resolution cap; it is stretched back to the element size
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function glassMap(w, h, radius, bezel) {
  w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
  const key = `${w}x${h}:${radius}:${bezel}`;
  if (cache.has(key)) return cache.get(key);
  if (typeof document === 'undefined') return null;
  const k = Math.min(1, MAX_SIDE / Math.max(w, h)), cw = Math.max(2, Math.round(w * k)), ch = Math.max(2, Math.round(h * k));
  const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d'); if (!ctx) return null;
  const img = ctx.createImageData(cw, ch), d = img.data, hx = cw / 2, hy = ch / 2;
  const rr = Math.min(radius, Math.min(w, h) / 2) * k, bz = Math.max(1, Math.min(bezel, Math.min(w, h) / 2) * k);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const px = x + 0.5 - hx, py = y + 0.5 - hy, qx = Math.abs(px) - (hx - rr), qy = Math.abs(py) - (hy - rr);
    const depth = -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr);   // distance inside the edge
    const i = (y * cw + x) * 4;
    let r = 128, g = 128, b = 0;
    if (depth >= 0 && depth < bz) {
      const t = depth / bz, u = 1 - t, f = Math.max(1e-4, 1 - u ** 4);
      const slope = Math.min(8, (u ** 3) * f ** -0.75);                   // slope of the superellipse bevel
      const a = Math.atan(slope), dev = a - Math.asin(Math.sin(a) / N);   // exact Snell deviation, no shortcut
      const mag = Math.tan(dev) / 0.9;                                    // 0..1
      let nx, ny;                                                         // outward direction (gradient of the distance field)
      if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy) || 1; nx = Math.sign(px) * qx / l; ny = Math.sign(py) * qy / l; }
      else if (qx > qy) { nx = Math.sign(px) || 1; ny = 0; } else { nx = 0; ny = Math.sign(py) || 1; }
      r = 128 + nx * mag * 127; g = 128 + ny * mag * 127; b = 255 * (1 - smooth(0.35, 1, t));
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL('image/png');
  if (cache.size > 40) cache.clear();
  cache.set(key, url);
  return url;
}

/** Only Chromium-based browsers can run an SVG filter inside backdrop-filter; everything else gets frosted glass. */
export const canRefract = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Chrome\/|Chromium\/|Edg\//.test(ua) && !/Firefox|OPR\/|CriOS|FxiOS/.test(ua);
};
