import { scopedWorkspace } from './workspaces.js';
import { HttpError } from './http.js';
import { raw } from './supabase.js';
const areas={
  conversations:['chat_log','id,question,answer,sources,answered,created_at'],
  assistant:['studio_chat','id,question,answer,created_at'],
  files:['files','id,name,status,audience,valid_from,valid_until'],
  articles:['posts','id,title,html,status,audience,valid_from,valid_until'],
};
export async function exportWorkspacePage(access,input={},database=raw) {
  if(!access?.workspace?.id||!['owner','admin'].includes(access.role))throw new HttpError(403,'A workspace administrator is required to export data.');
  if(!Object.hasOwn(areas,input.area))throw new HttpError(400,'Choose conversations, assistant, files or articles.');
  if(input.workspaceId && input.workspaceId!==access.workspace.id)throw new HttpError(409,'Your workspace changed during export. Select the workspace and start again.');
  const page=Number(input.page||1);
  if(!Number.isSafeInteger(page)||page<1||page>100000)throw new HttpError(400,'Choose an export page.');
  const [table,columns]=areas[input.area],{data,error}=await scopedWorkspace(access,database).from(table).select(columns).order('id').range((page-1)*100,page*100-1);
  if(error)throw new HttpError(503,'Data export is unavailable. Please try again.');
  return {area:input.area,page,rows:data,hasNext:data.length===100,workspaceId:access.workspace.id,exportedAt:new Date().toISOString()};
}

