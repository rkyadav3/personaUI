/** Signed storage upload; percentages describe transferred bytes, never processing time. */
export function uploadWithProgress({ url, key, path, token, blob, bucket = 'files', onProgress, createRequest = () => new XMLHttpRequest() }) {
  return new Promise((resolve, reject) => {
    if (!/^[a-z0-9-]+$/.test(bucket) || typeof path !== 'string' || /[\\?%]|(^|\/)\.{1,2}(\/|$)/.test(path)) return reject(new Error('Invalid upload destination.'));
    const endpoint = new URL(`/storage/v1/object/upload/sign/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, url);
    endpoint.searchParams.set('token', token);
    const request = createRequest();
    request.open('PUT', endpoint.href);
    request.timeout = 180000;
    request.setRequestHeader('apikey', key);
    request.setRequestHeader('Authorization', `Bearer ${key}`);
    request.setRequestHeader('x-upsert', 'false');
    request.upload.onprogress = event => { if (event.lengthComputable && event.total > 0) onProgress?.(Math.min(1, event.loaded / event.total)); };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) { onProgress?.(1); resolve(); }
      else {
        let message; try { message = JSON.parse(request.responseText)?.message; } catch { /* Storage can return a non-JSON error. */ }
        reject(new Error(message || `Upload failed (${request.status}). Try again.`));
      }
    };
    request.onerror = () => reject(new Error('The upload connection was interrupted. Try again.'));
    request.ontimeout = () => reject(new Error('The upload timed out. Check your connection and try again.'));
    request.onabort = () => reject(new Error('The upload was cancelled.'));
    const body = new FormData(); body.append('cacheControl', '3600'); body.append('', blob);
    request.send(body);
  });
}
