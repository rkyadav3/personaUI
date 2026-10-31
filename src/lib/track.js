// Fire-and-forget visitor counters (see api/track.js). Views and clicks are sent once per browser session;
// a rating is sent every time and returns the new average.
export function track(payload) {
  if (payload.kind !== 'rate') {
    const key = `t:${payload.kind}:${payload.slug || payload.id}`;
    try { if (sessionStorage.getItem(key)) return Promise.resolve(null); sessionStorage.setItem(key, '1'); } catch { /* private mode: fine */ }
  }
  return fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true })
    .then(async r => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) }), () => null);
}
