// Uploads go straight from the browser to Supabase Storage using a one-time signed token from the server,
// so large files never pass through a serverless function. The anon key is public by design.
import { createClient } from '@supabase/supabase-js';

let client;
export function uploadToSigned(path, token, blob) {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example).');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client.storage.from('files').uploadToSignedUrl(path, token, blob).then(({ error }) => { if (error) throw new Error(error.message); });
}
