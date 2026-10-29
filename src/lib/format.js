export const fmtSize = n => { n = n || 0; return n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`; };
export const fmtDate = ts => (ts || '').slice(0, 16).replace('T', ' ');

/** [{id, path: "a / b"}] sorted by path, for folder dropdowns. */
export function folderPaths(folders) {
  const by = new Map(folders.map(f => [f.id, f]));
  const path = f => { const parts = []; for (let cur = f; cur; cur = by.get(cur.parent_id)) parts.push(cur.name); return parts.reverse().join(' / '); };
  return folders.map(f => ({ id: f.id, path: path(f) })).sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase()));
}

/** Root-to-leaf list of folders ending at `id`. */
export function breadcrumbs(folders, id) {
  const by = new Map(folders.map(f => [f.id, f]));
  const trail = [];
  for (let cur = by.get(id); cur; cur = by.get(cur.parent_id)) trail.unshift(cur);
  return trail;
}

export const idOrNull = v => (v === '' || v == null ? null : Number(v));
