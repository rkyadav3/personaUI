import { randomBytes } from 'node:crypto';
import { raw } from './supabase.js';
import { HttpError } from './http.js';
import { credentialHash, integrationQuery, uuidValid } from './integrations.js';
const needAdmin=access=>{if(!access?.workspace?.id||!['owner','admin'].includes(access.role))throw new HttpError(403,'A workspace administrator is required.');};
export function createTeamService({database=raw}={}) {
  return {
    async list(access) {
      if(!access?.workspace?.id)throw new HttpError(403,'Workspace membership is required.');
      const members=await integrationQuery(database().from('workspace_members').select('user_id,role,status,user:users(id,name,email)').eq('workspace_id',access.workspace.id));
      const invitations=['owner','admin'].includes(access.role)?await integrationQuery(database().from('workspace_invitations').select('id,email,role,status,expires_at,created_at').eq('workspace_id',access.workspace.id).order('created_at',{ascending:false}).limit(100)):[];
      return {members,invitations,role:access.role};
    },
    async change(access,input) {
      needAdmin(access);
      const payload={};
      let token;
      if(input?.action==='invite'){
        const email=String(input.email||'').trim().toLowerCase();
        if(email.length>160||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new HttpError(400,'Enter a valid teammate email.');
        if(!['admin','contributor','viewer'].includes(input.role))throw new HttpError(400,'Choose a team role.');
        token='wi_'+randomBytes(32).toString('base64url');Object.assign(payload,{email,role:input.role,hash:credentialHash(token)});
      }else if(['member','remove'].includes(input?.action)){
        if(!uuidValid(input.userId))throw new HttpError(400,'Choose a team member.');
        if(input.action==='member'&&!['admin','contributor','viewer'].includes(input.role))throw new HttpError(400,'Choose a team role.');
        Object.assign(payload,{userId:input.userId,...(input.action==='member'?{role:input.role}:{})});
      }else if(input?.action==='revoke'){
        if(!uuidValid(input.id))throw new HttpError(400,'Choose an invitation.');payload.id=input.id;
      }else throw new HttpError(400,'Choose a team action.');
      const result=await integrationQuery(database().rpc('manage_workspace_team',{p_actor:access.actorId,p_workspace:access.workspace.id,p_action:input.action,p_input:payload}));
      return {...result,...(token?{token}:{})};
    },
    async accept(user,input) {
      if(!user?.id||user.isSuperAdmin||!user.workspaceEnabled)throw new HttpError(403,'Sign in with a workspace account.');
      if(typeof input?.token!=='string'||!/^wi_[A-Za-z0-9_-]{40,100}$/.test(input.token))throw new HttpError(400,'This invitation link is invalid.');
      return integrationQuery(database().rpc('accept_workspace_invitation',{p_actor:user.id,p_hash:credentialHash(input.token)}));
    },
    async switch(user,input) {
      if(!user?.workspaceEnabled||user.isSuperAdmin||!uuidValid(input?.workspaceId))throw new HttpError(403,'Choose an available workspace.');
      return integrationQuery(database().rpc('switch_workspace',{p_actor:user.id,p_workspace:input.workspaceId}));
    },
  };
}

