// Background image + look of each user's public page. The image lives in a PUBLIC bucket (visitors must see it),
// under the owner's id; the database row says which file is current.
import { randomUUID } from 'node:crypto';
import { BG_BUCKET, normalizeBg } from '../shared/siteSettings.js';
import { normalizePage } from '../shared/pageSettings.js';
import { normalizePortfolio } from '../shared/portfolio.js';
import { env } from './config.js';
import { raw, run } from './supabase.js';

const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
export const publicUrl = path => `${process.env.SUPABASE_URL}/storage/v1/object/public/${BG_BUCKET}/${path}`;
const row = async db => (await run(db.from('site_settings').select('*').limit(1)))[0] || null;
const view = r => ({ imageUrl: r?.bg_path ? publicUrl(r.bg_path) : null, bg: normalizeBg(r?.bg), heroUrl: r?.hero_path ? publicUrl(r.hero_path) : null, page: normalizePage(r?.page), portfolio: normalizePortfolio(r?.portfolio) });

export async function getSettings(db) { return view(await row(db)); }

/** Step 1 of an upload: a one-time signed URL so the image goes straight from the browser to storage. */
export async function signBackground(db, { type }) {
  const ext = EXT[type];
  if (!ext) throw new Error('Use a JPG, PNG or WebP image.');
  const path = `${db.uid}/${randomUUID()}.${ext}`;
  const { data, error } = await raw().storage.from(BG_BUCKET).createSignedUploadUrl(path);
  if (error) throw new Error(error.message);
  return { path, token: data.token };
}

async function removeFile(path) { if (path) await raw().storage.from(BG_BUCKET).remove([path]); }

/** Save the look, and optionally switch to a newly uploaded image (the old file is deleted). */
export async function saveSettings(db, { bg, path }) {
  const cur = await row(db);
  const patch = { bg: normalizeBg(bg), updated_at: new Date().toISOString() };
  if (path !== undefined) {
    if (path !== null && !String(path).startsWith(`${db.uid}/`)) throw new Error('Bad image path.');
    if (path !== null) {                                    // make sure the upload really happened
      const { data } = await raw().storage.from(BG_BUCKET).list(db.uid, { search: path.split('/').pop() });
      if (!data?.length) throw new Error('The image upload was not found. Try again.');
    }
    patch.bg_path = path;
    if (cur?.bg_path && cur.bg_path !== path) await removeFile(cur.bg_path);
  }
  if (cur) await run(db.from('site_settings').update(patch).eq('id', cur.id)); else await run(db.from('site_settings').insert(patch));
  return getSettings(db);
}

/** Save the look of the public profile page (/p/<slug>), and optionally switch its hero photo (the old file is deleted). */
export async function savePage(db, { page, portfolio, heroPath, bg, path }, storageOverride) {
  const cur = await row(db);
  const patch = { updated_at: new Date().toISOString() };
  if (bg !== undefined) patch.bg = normalizeBg(bg);
  const uploads = [['hero_path', heroPath], ['bg_path', path]];
  // Validate ownership for both uploads before writing or deleting either image.
  for (const [, imagePath] of uploads) {
    if (imagePath !== undefined && imagePath !== null && (typeof imagePath !== 'string' || !imagePath.startsWith(`${db.uid}/`) || imagePath.slice(db.uid.length + 1).includes('/') || imagePath.includes('..'))) throw new Error('Bad image path.');
  }
  const storage = () => storageOverride || raw().storage.from(BG_BUCKET);
  if (page !== undefined) patch.page = normalizePage(page);                       // each editor sends only what it owns
  if (portfolio !== undefined) {
    patch.portfolio = normalizePortfolio(portfolio);
    const ids = new Set();
    patch.portfolio.products = patch.portfolio.products.map(product => {
      const id = product.id.startsWith('legacy-') || ids.has(product.id) ? randomUUID() : product.id;
      ids.add(id); return { ...product, id };
    });
  }
  for (const [column, imagePath] of uploads) {
    if (imagePath === undefined) continue;
    if (imagePath !== null) {
      const filename = imagePath.split('/').pop();
      const { data, error } = await storage().list(db.uid, { search: filename });
      if (error || !data?.some(file => file.name === filename)) throw new Error('The image upload was not found. Try again.');
    }
    patch[column] = imagePath;
  }
  try {
    if (cur) await run(db.from('site_settings').update(patch).eq('id', cur.id)); else await run(db.from('site_settings').insert(patch));
  } catch (e) {
    if (/hero_path|\bpage\b|portfolio/i.test(e.message)) throw new Error('The database is missing the new columns. Run supabase/page.sql and supabase/portfolio.sql in the Supabase SQL editor, then try again.');
    throw e;
  }
  const retained = new Set([patch.hero_path === undefined ? cur?.hero_path : patch.hero_path, patch.bg_path === undefined ? cur?.bg_path : patch.bg_path].filter(Boolean));
  const stale = [...new Set(uploads.filter(([column, imagePath]) => imagePath !== undefined && cur?.[column] && cur[column] !== imagePath && !retained.has(cur[column])).map(([column]) => cur[column]))];
  let warning;
  if (stale.length) {
    try {
      const removed = await storage().remove(stale);
      if (removed?.error) warning = 'Your settings were saved, but an older image could not be removed.';
    } catch {
      warning = 'Your settings were saved, but an older image could not be removed.';
    }
  }
  const settings = await getSettings(db);
  return warning ? { ...settings, warning } : settings;
}

/** Background-only public API retained for existing integrations. Portfolio reads its settings through /api/profile. */
export async function publicSettings(slug) {
  slug = String(slug || env('DEFAULT_SLUG', '')).toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!slug) return null;
  const db = raw();
  const [u] = await run(db.from('users').select('id').eq('slug', slug).limit(1));
  if (!u) return null;
  const [r] = await run(db.from('site_settings').select('bg_path,bg').eq('owner_id', u.id).limit(1));
  return view(r);
}
