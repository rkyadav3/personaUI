import { useState } from 'react';
import { api } from '../lib/api.js';
import { Busy,Field,Notice } from './Ui.jsx';
export default function WorkspaceSwitcher({data}) {
 const [busy,setBusy]=useState(false),[failure,setFailure]=useState('');
 return <div className="workspace-switcher"><Field label="Current workspace"><select aria-label="Current workspace" value={data.workspace.id} disabled={busy} onChange={async e=>{setBusy(true);setFailure('');try{await api('workspace.switch',{workspaceId:e.target.value});window.location.assign('/admin');}catch(err){setFailure(err.message);setBusy(false);}}}>{data.workspaces.map(w=><option key={w.id} value={w.id}>{w.name||'Unnamed workspace'}</option>)}</select></Field><small>{data.workspace.type==='organization'?'Organization':'Individual'} · {data.role}</small>{busy&&<Busy label="Opening selected workspace…"/>}<Notice kind="error">{failure}</Notice></div>;
}

