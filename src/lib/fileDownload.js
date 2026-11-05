import { api } from './api.js';

/** Keep the window creation inside the user's click while the signed URL is fetched. */
export async function openFileDownload({ id, call = api, browser = globalThis.window }) {
  const popup = browser.open('about:blank', '_blank');
  if (!popup) throw new Error('Your browser blocked the download window. Allow pop-ups for this site and try again.');
  try {
    popup.opener = null;
    const { url } = await call('files.url', { id });
    let target;
    try { target = new URL(url); } catch { throw new Error('Download link unavailable. Try again.'); }
    if (!['https:', 'http:'].includes(target.protocol)) throw new Error('Download link unavailable. Try again.');
    if (!popup.closed) popup.location.replace(target.href);
  } catch (error) {
    popup.close();
    throw error;
  }
}
