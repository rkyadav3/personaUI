// Every admin call is POST /api/admin { op, args }.
// Identical calls that are still in flight share ONE request, so a double or triple click can never run the same
// action (create, delete, save, sign-in…) more than once. A new call is allowed as soon as the first one finishes.
const inflight = new Map();

async function send(op, args) {
  const r = await fetch('/api/admin', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, args }),
  });
  let data = null;
  try { data = await r.json(); } catch { /* non-JSON error page */ }
  if (!r.ok) { const e = new Error(data?.error || `Request failed (${r.status})`); e.status = r.status; throw e; }
  return data;
}

export function api(op, args = {}) {
  const key = `${op}\u0000${JSON.stringify(args)}`;
  let p = inflight.get(key);
  if (!p) {
    p = send(op, args).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}
