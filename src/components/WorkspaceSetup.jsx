import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { Busy, Notice, Skeleton } from './Ui.jsx';

export function WorkspaceChoice({ onChoose, busy, error }) {
  return <section className="workspace-setup"><h1>Who are you setting up Persona for?</h1><p className="muted">Choose the profile your persona will represent. Both options include a public Persona chatbot and a private Admin Assistant.</p><div className="row"><button className="btn" disabled={!!busy} onClick={() => onChoose('individual')}>Individual</button><button className="btn primary" disabled={!!busy} onClick={() => onChoose('organization')}>Organization</button></div><p className="muted">Individual: your background and expertise. Organization: your company, school, college or organization.</p>{busy && <Busy label={busy === 'organization' ? 'Setting up your organization' : 'Setting up your individual profile'} />}<Notice kind="error">{error}</Notice></section>;
}

export default function WorkspaceSetup({ children }) {
  const { user } = useAuth(), [workspace, setWorkspace] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState('');
  const load = () => { setError(''); api('workspace.current').then(result => setWorkspace(result.workspace), e => setError(e.message)); };
  useEffect(() => { if (user?.workspaceEnabled) load(); }, [user?.id, user?.workspaceEnabled]);
  if (!user?.workspaceEnabled) return children('individual');
  if (!workspace) return <><Skeleton label="Opening your profile setup…" />{error && <><Notice kind="error">{error}</Notice><button className="btn" onClick={load}>Retry</button></>}</>;
  if (!workspace.type) return <WorkspaceChoice busy={busy} error={error} onChoose={async type => {
    if (busy) return; setBusy(type); setError('');
    try { const saved = await api('workspace.setup', { type }); setWorkspace(saved); window.dispatchEvent(new Event('studio-changed')); } catch (e) { setError(e.message); } finally { setBusy(''); }
  }} />;
  return children(workspace.type);
}
