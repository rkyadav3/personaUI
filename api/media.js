import { sessionUser } from '../server/auth.js';
import { createPublicRepository } from '../server/publicRepository.js';
import { scoped } from '../server/tenant.js';
import { getAsset } from '../server/assets.js';
import { createAssetStorage } from '../server/assetStorage.js';
import { HttpError, publicError } from '../server/http.js';
import { raw, run } from '../server/supabase.js';
import { assetIdValid } from '../shared/assets.js';

export function createMediaHandler({ viewerFor = sessionUser, repository = createPublicRepository, scope = scoped, storage = createAssetStorage, database = raw } = {}) {
return async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  try {
    let slug = typeof req.query?.slug === 'string' ? req.query.slug : '';
    const legacyPath = typeof req.query?.path === 'string' ? req.query.path : '';
    const ownerId = typeof req.query?.owner === 'string' ? req.query.owner : '';
    if (legacyPath || ownerId) {
      if (!assetIdValid(ownerId) || legacyPath && (!legacyPath.startsWith(`${ownerId}/`) || !/^[A-Za-z0-9_-]+\.(png|jpg|jpeg|webp)$/i.test(legacyPath.slice(ownerId.length + 1)))) throw new HttpError(404, 'Media not found.');
      const [account] = await run(database().from('users').select('slug').eq('id', ownerId).limit(1));
      slug = account?.slug || '';
    }
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) throw new HttpError(404, 'Media not found.');
    const viewer = await viewerFor(req), repo = repository();
    const account = await repo.accountOwner(slug);
    const user = account?.id === viewer?.id ? account : await repo.owner(slug, viewer);
    if (!user) throw new HttpError(404, 'Media not found.');
    let asset;
    if (legacyPath) {
      const db = scope(user.id);
      const [site] = await run(db.from('site_settings').select('bg_path,hero_path').limit(1));
      if ([site?.bg_path, site?.hero_path].includes(legacyPath)) asset = { storage_path: legacyPath, mime: 'image/jpeg', bucket: 'backgrounds' };
      else {
        const [registered] = await run(db.from('assets').select('id').eq('bucket', 'backgrounds').eq('storage_path', legacyPath).eq('purpose', 'media').limit(1));
        if (!registered) throw new HttpError(404, 'Media not found.');
        asset = await getAsset(db, registered.id, 'media');
      }
    } else asset = await getAsset(scope(user.id), req.query.id, 'media');
    const inline = /^(image|audio|video)\//.test(asset.mime);
    const { data, error } = await storage().signDownload(asset.storage_path, inline ? null : asset.name, 60, asset.bucket);
    if (error || !data?.signedUrl) throw new HttpError(503, 'Media is unavailable.');
    return res.redirect(302, data.signedUrl);
  } catch (error) { return publicError(res, error, 'media'); }
};
}
export default createMediaHandler();
