// Shrinks a chosen picture in the browser before upload: max 2200 px on the long side, WebP (or JPEG), under 3 MB.
// Re-drawing also drops any hidden metadata (GPS position, camera info) from the photo.
const MAX_SIDE = 2200, MAX_BYTES = 3 * 1024 * 1024;

const toBlob = (canvas, type, q) => new Promise(res => canvas.toBlob(res, type, q));

export async function prepareImage(file) {
  if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type)) throw new Error('Choose a JPG, PNG or WebP picture.');
  const bmp = await createImageBitmap(file).catch(() => { throw new Error("That picture couldn't be read."); });
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h); bmp.close?.();
  let type = 'image/webp', blob = await toBlob(canvas, type, 0.86);
  if (!blob || blob.type !== type) { type = 'image/jpeg'; blob = await toBlob(canvas, type, 0.86); }   // very old browsers
  for (let q = 0.78; blob.size > MAX_BYTES && q > 0.4; q -= 0.12) blob = await toBlob(canvas, type, q);
  if (blob.size > MAX_BYTES) throw new Error('That picture is too large even after shrinking. Try a smaller one.');
  return { blob, type, width: w, height: h };
}
