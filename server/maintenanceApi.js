import { timingSafeEqual } from 'node:crypto';
import { createWebhookService } from './webhooks.js';
import { raw } from './supabase.js';
import { integrationQuery } from './integrations.js';
import { HttpError,publicError } from './http.js';
export function createMaintenanceHandler({drain=()=>createWebhookService().drain(),retention=()=>integrationQuery(raw().rpc('run_workspace_retention')),secret=()=>process.env.CRON_SECRET}={}) {
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!['POST','GET'].includes(req.method))return res.status(405).json({error:'GET or POST only'});
  try{
   const key=secret();if(!key||key.length<32)throw new HttpError(503,'Maintenance authorization is not configured.');
   const supplied=Buffer.from(String(req.headers?.authorization||'')),expected=Buffer.from('Bearer '+key);
   if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw new HttpError(401,'Maintenance authorization is required.');
   const deliveries=await drain(),cleanup=await retention();return res.status(200).json({deliveries,cleanup});
  }catch(error){return publicError(res,error,'workspace-maintenance');}
 };
}
export default createMaintenanceHandler();

