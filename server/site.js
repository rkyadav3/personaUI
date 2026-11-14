import { isSuperAdminEmail } from './auth.js';
import { getAsset } from './assets.js';
// Uploaded images are private in storage; public media routes enforce profile access.
import { randomUUID } from 'node:crypto';
import { BG_BUCKET, normalizeBg } from '../shared/siteSettings.js';
import { normalizePage } from '../shared/pageSettings.js';
import { normalizePortfolio } from '../shared/portfolio.js';
import { CHECKOUT_CURRENCIES } from '../shared/commerce.js';
import { env } from './config.js';
import { raw, run } from './supabase.js';
import { canViewProfile } from '../shared/governance.js';
import { HttpError } from './http.js';

const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
export const publicUrl = path => `/api/media?owner=${encodeURIComponent(String(path).split('/')[0])}&path=${encodeURIComponent(path)}`;
export function hostedMediaUrl(url) {
  const prefix = `${process.env.SUPABASE_URL}/storage/v1/object/public/${BG_BUCKET}/`;
  return typeof url === 'string' && url.startsWith(prefix) ? publicUrl(url.slice(prefix.length)) : url;
}
export function hostedMediaTree(value) {
  if (typeof value === 'string') return hostedMediaUrl(value);
  if (Array.isArray(value)) return value.map(hostedMediaTree);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, hostedMediaTree(item)]));
  return value;
}
const row = async db => (await run(db.from('site_settings').select('*').limit(1)))[0] || null;
const view = r => ({ version: r?.updated_at || null, uploadedImageUrl: r?.bg_path ? publicUrl(r.bg_path) : null, uploadedHeroUrl: r?.hero_path ? publicUrl(r.hero_path) : null, imageUrl: normalizeBg(r?.bg).imageUrl || (r?.bg_path ? publicUrl(r.bg_path) : null), bg: normalizeBg(r?.bg), heroUrl: normalizePage(r?.page).hero.imageUrl || (r?.hero_path ? publicUrl(r.hero_path) : null), page: normalizePage(r?.page), portfolio: normalizePortfolio(r?.portfolio) });

export async function getSettings(db) { return hostedMediaTree(view(await row(db))); }

/** Step 1 of an upload: a one-time signed URL so the image goes straight from the browser to storage. */
export async function signBackground(db, { type }) {
  const ext = EXT[type];
  if (!ext) throw new Error('Use a JPG, PNG or WebP image.');
  const path = `${db.uid}/${randomUUID()}.${ext}`;
  const { data, error } = await raw().storage.from(BG_BUCKET).createSignedUploadUrl(path);
  if (error) throw new Error(error.message);
  return { path, token: data.token };
}

/** Save the look, and optionally switch to a newly uploaded image (the old file is deleted). */
export function saveSettings(db, { bg, path }, storageOverride) {
  return savePage(db, { bg: normalizeBg(bg), path }, storageOverride);
}

/** Save the look of the public profile page (/p/<slug>), and optionally switch its hero photo (the old file is deleted). */
export async function savePage(db, { page, portfolio, portfolioPatch, heroPath, bg, path, expectedVersion, applyItemCurrency = false }, storageOverride) {
  const cur = await row(db);
  const conflict = () => { throw new HttpError(409, 'Your settings changed in another editor or assistant review. Reload the latest settings and review your changes again.'); };
  if (expectedVersion !== undefined && expectedVersion !== (cur?.updated_at || null)) conflict();
  if (applyItemCurrency === true) {
    const currency = String(page?.currency || '').trim().toUpperCase();
    if (!CHECKOUT_CURRENCIES.includes(currency)) throw new HttpError(400, 'Choose a supported Store currency.');
    if (expectedVersion === undefined || portfolio !== undefined || portfolioPatch !== undefined || heroPath !== undefined || bg !== undefined || path !== undefined || Object.keys(page || {}).some(key => key !== 'currency')) throw new HttpError(400, 'Apply Store currency separately from other page changes.');
    const { error } = await db.rpc('save_store_currency', { p_owner: db.uid, p_currency: currency, p_expected_version: expectedVersion });
    if (error) throw new HttpError(error.message?.includes('changed') ? 409 : 500, error.message || 'Store currency could not be saved.');
    return getSettings(db);
  }
  if (portfolioPatch !== undefined) {
    if (!portfolioPatch || typeof portfolioPatch !== 'object' || Array.isArray(portfolioPatch) || Object.keys(portfolioPatch).some(key => !Object.hasOwn(normalizePortfolio(), key))) throw new HttpError(400, 'Unknown portfolio field.');
    portfolio = { ...cur?.portfolio, ...portfolioPatch };
  }
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
    for (const product of patch.portfolio.products) {
      const previous = normalizePortfolio(cur?.portfolio).products.find(item => item.id === product.id);
      if (product.deliveryUrl && product.deliveryUrl !== previous?.deliveryUrl) throw new Error('Upload a delivery file instead of using an external access link.');
      if (product.assetId && product.assetId !== previous?.assetId) await getAsset(db, product.assetId, 'delivery');
      if (product.assetId) product.deliveryUrl = '';
    }
    const ids = new Set();
    const remapped = new Map();
    patch.portfolio.products = patch.portfolio.products.map(product => {
      const id = product.id.startsWith('legacy-') || ids.has(product.id) ? randomUUID() : product.id;
      if (id !== product.id && !remapped.has(product.id)) remapped.set(product.id, id);
      ids.add(id); return { ...product, id };
    });
    if (remapped.size) {
      patch.page = patch.page || normalizePage(cur?.page);
      patch.page.customization.homeFeaturedItems = patch.page.customization.homeFeaturedItems.map(ref => { const [kind, id] = ref.split(':'); return kind === 'product' && remapped.has(id) ? `product:${remapped.get(id)}` : ref; });
    }
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
    if (cur?.updated_at) {
      const written = await run(db.from('site_settings').update(patch).eq('id', cur.id).eq('updated_at', cur.updated_at).select('id'));
      if (!written?.length) conflict();
    } else if (cur) await run(db.from('site_settings').update(patch).eq('id', cur.id)); else await run(db.from('site_settings').insert(patch));
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
export async function publicSettings(slug, viewer = null) {
  slug = String(slug || env('DEFAULT_SLUG', '')).toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!slug) return null;
  const db = raw();
  const [u] = await run(db.from('users').select('id,email,tags,profile_private,locked_until').eq('slug', slug).limit(1));
  if (isSuperAdminEmail(u?.email) || !canViewProfile(u, viewer)) return null;
  const [r] = await run(db.from('site_settings').select('bg_path,bg').eq('owner_id', u.id).limit(1));
  return hostedMediaTree(view(r));
}
