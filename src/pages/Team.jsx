import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useOp } from '../lib/hooks.js';
import { Busy,Field,Notice,Skeleton } from '../components/Ui.jsx';
import '../styles/integrations.css';
const roles={admin:'Administrator — workspace settings and Admin Assistant',contributor:'Contributor — files, articles and knowledge',viewer:'Viewer — read workspace content'};
export default function Team() {
 const [params]=useSearchParams(),token=params.get('invite');
 if(token)return <AcceptInvitation token={token}/>;
 return <TeamMembers/>;
}
function AcceptInvitation({token}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <section className="card integration-page"><h1>Join this workspace</h1><p>Use the email named in your invitation. Your personal workspace stays available in the workspace selector. New accounts require a platform invitation; after creating your account, reopen this team link.</p><button className="btn primary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await api('team.accept',{token});window.history.replaceState({},'','/admin/team');window.location.assign('/admin');}catch(e){setError(e.message);setBusy(false);}}}>{busy?'Joining workspace…':'Accept invitation'}</button>{busy&&<Busy label="Joining your team…"/>}<Notice kind="error">{error}</Notice></section>;
}
function TeamMembers() {
 const {data,error,loading,reload}=useOp('team.list');
 const [email,setEmail]=useState(''),[role,setRole]=useState('contributor'),[busy,setBusy]=useState(false),[link,setLink]=useState(''),[notice,setNotice]=useState(null);
 async function change(input){if(busy)return;setBusy(true);setNotice(null);try{const result=await api('team.change',input);if(result.token){setLink(location.origin+'/admin/team?invite='+encodeURIComponent(result.token));setEmail('');}if(['member','remove'].includes(input.action)){window.dispatchEvent(new Event('workspace-access-changed'));window.dispatchEvent(new Event('studio-changed'));}await reload();setNotice({kind:'success',text:'Team access updated.'});}catch(e){setNotice({kind:'error',text:e.message});}finally{setBusy(false);}}
 const canManage=['owner','admin'].includes(data?.role);
 return <div className="integration-page"><div className="head"><div><h1>Team access</h1><p className="muted">Your workspace shares one public Persona and one private Admin Assistant.</p></div><button className="btn" disabled={busy||loading} onClick={reload}>Refresh</button></div>{busy&&<Busy label="Updating team access…"/>}{error&&<><Notice kind="error">{error}</Notice><button className="btn" onClick={reload}>Retry</button></>}{!data&&loading&&<Skeleton label="Opening your team…"/>}
 {data&&<><section className="card"><h2>Members</h2>{data.members.map(member=><article className="integration-row" key={member.user_id}><div><h3>{member.user?.name||member.user?.email||'Team member'}</h3><p className="muted">{member.user?.email} · {member.role} · {member.status}</p></div>{canManage&&member.role!=='owner'&&<div className="row"><select aria-label={'Role for '+member.user?.email} value={member.role} disabled={busy} onChange={e=>change({action:'member',userId:member.user_id,role:e.target.value})}>{Object.entries(roles).map(([key])=><option key={key} value={key}>{key}</option>)}</select><button className="btn danger" disabled={busy||member.status==='revoked'} onClick={()=>change({action:'remove',userId:member.user_id})}>Remove access</button></div>}</article>)}</section>
 {canManage&&<section className="card"><h2>Invite a teammate</h2><p className="muted">The link works for this email only and expires after 7 days. Share it with your teammate; they can sign in or create an account first.</p><form onSubmit={e=>{e.preventDefault();change({action:'invite',email,role});}}><fieldset disabled={busy}><Field label="Teammate email"><input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label="Access role"><select value={role} onChange={e=>setRole(e.target.value)}>{Object.entries(roles).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field><button className="btn primary">Create invitation link</button></fieldset></form>{link&&<><Field label="Invitation link"><input readOnly value={link}/></Field><button className="btn" onClick={()=>setLink('')}>Dismiss link</button></>}<h3>Invitation history</h3>{data.invitations.map(invite=><article className="integration-row" key={invite.id}><div><p>{invite.email} · {invite.role} · {invite.status}</p><p className="muted">Expires {new Date(invite.expires_at).toLocaleString()}</p></div>{invite.status==='pending'&&<button className="btn" disabled={busy} onClick={()=>change({action:'revoke',id:invite.id})}>Revoke invitation</button>}</article>)}</section>}</>}
 <Notice kind={notice?.kind}>{notice?.text}</Notice></div>;
}

