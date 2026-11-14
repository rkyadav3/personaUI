import { randomUUID } from 'node:crypto';
import { assetIdValid, assetSpec } from '../shared/assets.js';
import { run } from './supabase.js';
import { createAssetStorage } from './assetStorage.js';
import { HttpError } from './http.js';

export function ownedAssetPath(owner, asset) {
  if (!owner || asset?.owner_id !== owner || !assetIdValid(asset.id) || !new RegExp(`^${asset.id}\\.[a-z0-9]+$`, 'i').test(String(asset.storage_path || '').slice(owner.length + 1)) || !asset.storage_path.startsWith(`${owner}/`)) throw new HttpError(404, 'File not found in this account.');
  return asset.storage_path;
}
export async function getAsset(db, id, purpose) {
  if (!assetIdValid(id)) throw new HttpError(400, 'Choose an uploaded file.');
  const [asset] = await run(db.from('assets').select('*').eq('id', id).limit(1));
  ownedAssetPath(db.uid, asset);
  if (asset.status !== 'ready' || purpose && asset.purpose !== purpose) throw new HttpError(409, 'The uploaded file is not ready for this use.');
  return asset;
}
export async function signAsset(db, input, storage = createAssetStorage()) {
  let spec;
  try { spec = assetSpec(input); } catch (error) { throw new HttpError(400, error.message); }
  const id = randomUUID(), path = `${db.uid}/${id}.${spec.extension}`;
  await run(db.from('assets').insert({ id, name: spec.name, mime: spec.mime, size: spec.size, purpose: spec.purpose, storage_path: path, status: 'pending' }));
  const { data, error } = await storage.signUpload(path);
  if (error) throw new HttpError(503, 'File storage is unavailable. Please try again.');
  return { id, path, token: data.token, mime: spec.mime };
}
export async function registerAsset(db, { id }, storage = createAssetStorage()) {
  if (!assetIdValid(id)) throw new HttpError(400, 'Invalid upload.');
  const [asset] = await run(db.from('assets').select('*').eq('id', id).limit(1));
  const path = ownedAssetPath(db.uid, asset);
  const { data, error } = await storage.info(path);
  const size = Number(data?.size ?? data?.metadata?.size), mime = data?.content_type ?? data?.contentType ?? data?.metadata?.mimetype;
  if (error || size !== Number(asset.size) || mime !== asset.mime) throw new HttpError(409, 'The uploaded file does not match its size or type. Choose the file again.');
  await run(db.from('assets').update({ status: 'ready' }).eq('id', id));
  return { id, name: asset.name, purpose: asset.purpose, mime: asset.mime, size };
}
export async function downloadAsset(db, id, storage = createAssetStorage(), purpose) {
  const asset = await getAsset(db, id, purpose);
  const { data, error } = await storage.signDownload(asset.storage_path, asset.name, 60, asset.bucket);
  if (error || !data?.signedUrl) throw new HttpError(503, 'This file cannot be opened right now. Please try again.');
  return { url: data.signedUrl, expiresIn: 60 };
}
