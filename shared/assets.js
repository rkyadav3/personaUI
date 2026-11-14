export const ASSET_BUCKET = 'persona-assets';
export const ASSET_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  pdf: 'application/pdf', epub: 'application/epub+zip', txt: 'text/plain',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav',
  zip: 'application/zip', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
export const ASSET_ACCEPT = Object.keys(ASSET_TYPES).map(ext => `.${ext}`).join(',');
export const ASSET_MAX_BYTES = 50 * 1024 * 1024;
export const assetIdValid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export function assetSpec(input) {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const extension = name.split('.').pop()?.toLowerCase();
  const mime = ASSET_TYPES[extension], size = Number(input?.size);
  if (!name || name.length > 240 || /[\/\\\u0000-\u001f]/.test(name) || !mime) throw new Error('Choose a supported image, document, audio, video or ZIP file.');
  if (!Number.isSafeInteger(size) || size < 1 || size > ASSET_MAX_BYTES) throw new Error('Choose a file between 1 byte and 50 MB.');
  if (!['media', 'delivery'].includes(input?.purpose)) throw new Error('Choose public media or a private delivery file.');
  return { name, extension, mime, size, purpose: input.purpose };
}
