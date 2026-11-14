// All provider-specific storage operations stay behind this adapter.
import { raw } from './supabase.js';
import { ASSET_BUCKET } from '../shared/assets.js';
export function createAssetStorage(client = raw) {
  const bucket = () => client().storage.from(ASSET_BUCKET);
  return {
    signUpload: path => bucket().createSignedUploadUrl(path, { upsert: false }),
    info: path => bucket().info(path),
    signDownload: (path, name, seconds = 60, bucketName = ASSET_BUCKET) => client().storage.from(bucketName).createSignedUrl(path, seconds, name ? { download: name } : {}),
  };
}
