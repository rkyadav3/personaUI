// Local-only verification. No hosted writes or model calls.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '../../src/App.jsx';
import '../../src/styles.css';
const params=new URLSearchParams(location.search);
const route=params.get('view') || '/admin/integrations';
const role=params.get('role') || 'owner';
let signedIn=params.get('signedOut')!=='true';
const owner='11111111-1111-4111-8111-111111111111';
const user={id:owner,email:'admin@example.test',name:'Acme Admin',slug:'acme',isAdmin:!route.startsWith('/superadmin'),isSuperAdmin:route.startsWith('/superadmin'),workspaceEnabled:true,activeWorkspaceId:owner};
const workspace={id:owner,owner_id:owner,name:'Acme School',type:'organization',status:'active',slug:'acme'};
const data={integrations:[],settings:{monthly_limit:1000,minute_limit:30,enabled:true,external_enabled:true},usage:{requests:12,platform:8,external:4,failed:0}};
window.addonsFixture={data,fail:false,requests:[]};
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
window.fetch=async(url,options={})=>{
  if(url==='/api/track')return json({ok:true});
  if(url!=='/api/admin')throw new Error('Unexpected fixture request '+url);
  const {op,args={}}=JSON.parse(options.body||'{}');window.addonsFixture.requests.push(op);
  if(op==='auth.me'){if(params.get('delay'))await new Promise(resolve=>setTimeout(resolve,Number(params.get('delay'))));return json({user:signedIn?user:null});}
  if(op==='auth.login'){signedIn=true;return json({user});}
  if(op==='profile.get')return json({profile:{id:1,name:'Acme School',profile_type:'organization',status:'published',organization:{type:'school'}},contributions:[]});
  if(op==='site.get')return json({});
  if(op==='workspace.current')return json({workspace,role,workspaces:[workspace,{id:'22222222-2222-4222-8222-222222222222',name:'Personal workspace',type:'individual'}]});
  if(op==='team.list')return json({role,members:[{user_id:owner,role:'owner',status:'active',user:{name:user.name,email:user.email}}],invitations:data.invitations||[]});
  if(op==='team.change'){if(window.addonsFixture.fail)return json({error:'Team save unavailable. Try again.'},503);if(args.action==='invite'){(data.invitations||=[]).push({id:'invitation',email:args.email,role:args.role,status:'pending',expires_at:'2027-01-01'});return json({token:'wi_'+'a'.repeat(43)});}return json({ok:true});}
  if(op==='team.accept')return json({error:'Invitation unavailable. Ask for a new link.'},403);
  if(op==='webhooks.list')return json({endpoints:data.endpoints||[],deliveries:[],encryptionConfigured:true});
  if(op==='webhooks.change'){if(window.addonsFixture.fail)return json({error:'Webhook save unavailable. Try again.'},503);if(args.action==='create'){(data.endpoints||=[]).push({id:'hook',endpoint:args.endpoint,events:args.events,enabled:true});return json({secret:'local-fixture-signing-secret'});}data.endpoints.find(h=>h.id===args.id).enabled=args.enabled;return json({ok:true});}
  if(op==='webhooks.run')return json({processed:0});
  if(op==='data.export')return json({area:args.area,workspaceId:owner,rows:[{id:1}],hasNext:false,exportedAt:new Date().toISOString()});
  if(op==='files.get')return json({id:1,name:'Admissions.txt',text_content:'School admissions requirements',status:'published',mime:'text/plain'});
  if(op==='index.counts')return json({files:1,posts:0,chunks:3,embedded:3});
  if(op==='index.settings')return json({});
  if(op==='knowledge.sources')return json({sources:[]});
  if(op==='enquiries.count')return json({new:0});
  if(op==='integrations.list')return json(data);
  if(op==='integrations.status')return json({lastRequest:window.addonsFixture.lastRequest||null});
  if(op==='platform.workspaces.list')return json({workspaces:[{...workspace,owner:{email:user.email},settings:data.settings}],page:1,hasNext:false});
  if(op==='platform.workspaces.health')return json({checkedAt:new Date().toISOString(),api:{requests:12,failed:0,pending:0,stuck:0,p95Ms:650,platform:8,external:4},security:{activeKeys:1,expiringKeys:0,expiredKeys:0,revokedKeys:0,rejections:{}},probes:[{component:'generation',status:'unknown',detail:'No recent check.'},{component:'embedding',status:'unknown',detail:'No recent check.'}]});
  if(op==='platform.workspaces.audit')return json({rows:[]});
  if(op==='platform.workspaces.change'){if(window.addonsFixture.fail)return json({error:'Workspace save unavailable.'},503);if(args.status)workspace.status=args.status;Object.assign(data.settings,Object.fromEntries(Object.entries(args).filter(([key])=>key!=='workspaceId'&&key!=='status')));return json({ok:true});}
  if(op==='platform.workspaces.check')return json({ok:true});
  if(op==='integrations.change'){
    if(window.addonsFixture.fail)return json({error:'Could not save your connection. Try again.'},503);
    if(args.action==='create')data.integrations.push({id:'22222222-2222-4222-8222-222222222222',name:args.name,site_origin:args.origin,enabled:true,keys:[{id:'key',prefix:'ps_fixture',expires_at:'2027-02-01',revoked_at:null}]});
    const site=data.integrations.find(row=>row.id===args.id);
    if(args.action==='toggle')site.enabled=args.enabled;
    if(args.action==='revoke')site.keys.forEach(k=>k.revoked_at=new Date().toISOString());
    return json({...(args.action==='create'||args.action==='rotate'?{integrationId:args.id||'22222222-2222-4222-8222-222222222222',secret:'ps_local_fixture_not_a_real_secret'}:{})});
  }
  if(op.startsWith('activity.'))return json({counts:{},baseline:null,away:false});
  if(op.endsWith('.list') || op.endsWith('.all'))return json([]);
  return json({});
};
history.replaceState({},'',route);
createRoot(document.getElementById('root')).render(<BrowserRouter><App /></BrowserRouter>);

