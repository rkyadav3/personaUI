import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { uploadToSigned } from '../lib/storage.js';
import { ASSET_ACCEPT, ASSET_BUCKET } from '../../shared/assets.js';

const UploadContext = createContext(null);
export function UploadGroup({ children }) {
  const [pending, setPending] = useState(() => new Set());
  const parent = useContext(UploadContext);
  const track = (id, busy) => { parent?.(id, busy); setPending(current => { const next = new Set(current); if (busy) next.add(id); else next.delete(id); return next; }); };
  return <UploadContext.Provider value={track}>{children(pending.size > 0)}</UploadContext.Provider>;
}

export async function uploadAsset(file, purpose) {
  const signed = await api('assets.sign', { name: file.name, size: file.size, purpose });
  await uploadToSigned(signed.path, signed.token, new Blob([file], { type: signed.mime }), ASSET_BUCKET);
  return api('assets.register', { id: signed.id });
}

export default function MediaUpload({ label, value, onChange, accept = ASSET_ACCEPT, onBusy, purpose = 'media', fileName }) {
  const id = useId(), { user } = useAuth() || {};
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [name, setName] = useState('');
  const alive = useRef(true);
  const group = useContext(UploadContext), handlers = useRef(null), pending = useRef(false);
  handlers.current = { onChange, onBusy, group };
  const reportBusy = value => { pending.current = value; handlers.current.onBusy?.(value); handlers.current.group?.(id, value); };
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (pending.current) { handlers.current.onBusy?.(false); handlers.current.group?.(id, false); } }; }, [id]);
  async function choose(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;
    setBusy(true); reportBusy(true); setError('');
    try {
      if (!user?.slug) throw new Error('Sign in before uploading a file.');
      const asset = await uploadAsset(file, purpose);
      if (!alive.current) return;
      if (purpose === 'delivery') handlers.current.onChange(asset.id);
      else handlers.current.onChange(`/api/media?owner=${encodeURIComponent(user.id)}&id=${asset.id}`);
      setName(asset.name);
    } catch (failure) { if (alive.current) setError(failure.message); }
    finally { if (alive.current) { setBusy(false); reportBusy(false); } }
  }
  return <div className="f media-field">
    {purpose === 'media' ? <><label htmlFor={`${id}-link`}>{label}</label><input id={`${id}-link`} type="text" value={value || ''} placeholder="Choose a file or paste a public link" disabled={busy} onChange={event => { onChange(event.target.value); setName(''); }} /></> : <span>{label}</span>}
    <div className="media-upload-row"><input id={`${id}-file`} type="file" accept={accept} disabled={busy} aria-label={`Choose file for ${label}`} onChange={choose} />
      {value && <button type="button" className="btn small" disabled={busy} onClick={() => { onChange(''); setName(''); }}>Clear</button>}</div>
    <small className="hint" role="status">{busy ? 'Uploading file…' : name || fileName || (value && purpose === 'delivery' ? 'Delivery file attached' : 'Files up to 50 MB')}{purpose === 'delivery' && !busy ? ' · Available only after checkout. Excluded from AI knowledge.' : ''}</small>
    {error && <small className="notice error" role="alert">{error}</small>}
  </div>;
}
