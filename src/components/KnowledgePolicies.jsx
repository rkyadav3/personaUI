import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Busy, Field, Notice, Skeleton } from './Ui.jsx';

const localDate = value => value ? new Date(Date.parse(value) - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
export default function KnowledgePolicies({ readOnly = false }) {
  const [sources, setSources] = useState(null), [selected, setSelected] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState('');
  const load = () => { setError(''); api('knowledge.sources').then(result => setSources(result.sources), e => setError(e.message)); };
  useEffect(() => { let active = true; api('knowledge.sources').then(result => { if (active) setSources(result.sources); }, e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  const update = (key, value) => { setSelected(current => ({ ...current, [key]: value })); setSaved(''); };
  if (!sources) return <><Skeleton label="Opening source access settings…" />{error && <><Notice kind="error">{error}</Notice><button className="btn" onClick={load}>Retry</button></>}</>;
  return <section className="card"><h3>Source access and validity</h3><p className="muted">Your public persona uses published public sources within their validity dates. Internal sources stay out of public answers.</p>
    {!sources.length ? <p>Add a file or article to manage its access.</p> : <Field label="Choose a source"><select disabled={busy} value={selected ? `${selected.kind}:${selected.id}` : ''} onChange={e => { const row = sources.find(item => `${item.kind}:${item.id}` === e.target.value); setSelected(row ? { ...row, validFrom: localDate(row.valid_from), validUntil: localDate(row.valid_until) } : null); setSaved(''); }}><option value="">Choose a file or article</option>{sources.map(row => <option key={`${row.kind}:${row.id}`} value={`${row.kind}:${row.id}`}>{row.kind === 'file' ? 'File' : 'Article'}: {row.label}</option>)}</select></Field>}
    {selected && <form onSubmit={async event => { event.preventDefault(); if (busy || readOnly) return; setBusy(true); setError(''); setSaved('');
      try {
        const input = { ...selected, validFrom: selected.validFrom ? new Date(selected.validFrom).toISOString() : null, validUntil: selected.validUntil ? new Date(selected.validUntil).toISOString() : null };
        const result = await api('knowledge.policy', input);
        const updated = { ...selected, ...result, valid_from: input.validFrom, valid_until: input.validUntil };
        setSources(rows => rows.map(row => row.kind === selected.kind && row.id === selected.id ? updated : row));
        setSelected(updated);
        setSaved('Source access saved. New persona requests use these rules immediately.');
      } catch (e) { setError(e.message); } finally { setBusy(false); }
    }}><fieldset className="admin-form-body" disabled={busy || readOnly}><Field label="Audience"><select value={selected.audience} onChange={e => update('audience', e.target.value)}><option value="public">Public persona knowledge</option><option value="internal">Internal — excluded from public persona</option></select></Field><div className="cols c2"><Field label="Valid from (your local time)"><input type="datetime-local" value={selected.validFrom} onChange={e => update('validFrom', e.target.value)} /></Field><Field label="Valid until (your local time)"><input type="datetime-local" value={selected.validUntil} onChange={e => update('validUntil', e.target.value)} /></Field></div>{!readOnly && <button className="btn primary" type="submit">{busy ? 'Saving source access…' : 'Save source access'}</button>}</fieldset>{busy && <Busy label="Saving source access…" />}</form>}
    <Notice kind="error">{error}</Notice>{error && <button className="btn" onClick={load} disabled={busy}>Refresh source list</button>}<Notice kind="success">{saved}</Notice>{sources.length >= 100 && <p className="muted">Showing up to 100 files and 100 articles.</p>}
  </section>;
}
