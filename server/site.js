// Background image + look of each user's public page. The image lives in a PUBLIC bucket (visitors must see it),
// under the owner's id; the database row says which file is current.
import { randomUUID } from 'node:crypto';
import { BG_BUCKET, normalizeBg } from '../shared/siteSettings.js';
import { env } from './config.js';
import { raw, run } from './supabase.js';

const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
export const publicUrl = path => `${process.env.SUPABASE_URL}/storage/v1/object/public/${BG_BUCKET}/${path}`;
const row = async db => (await run(db.from('site_settings').select('*').limit(1)))[0] || null;
const view = r => ({ imageUrl: r?.bg_path ? publicUrl(r.bg_path) : null, bg: normalizeBg(r?.bg) });

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

/** Public: what a visitor of /u/<slug> (or the root page) needs to draw the background. Nothing else. */
export async function publicSettings(slug) {
  slug = String(slug || env('DEFAULT_SLUG', '')).toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!slug) return null;
  const db = raw();
  const [u] = await run(db.from('users').select('id').eq('slug', slug).limit(1));
  if (!u) return null;
  const [r] = await run(db.from('site_settings').select('bg_path,bg').eq('owner_id', u.id).limit(1));
  return view(r);
}
