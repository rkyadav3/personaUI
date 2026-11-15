import { createCipheriv,createDecipheriv,createHmac,randomBytes,timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import https from 'node:https';
import { raw } from './supabase.js';
import { HttpError } from './http.js';
import { integrationQuery,uuidValid } from './integrations.js';
export const WEBHOOK_EVENTS=['profile.updated','knowledge.changed','persona.answered','membership.changed'];
const encryptionKey = value => {const key=Buffer.from(value||process.env.WEBHOOK_ENCRYPTION_KEY||'','base64');if(key.length!==32)throw new HttpError(503,'Configure WEBHOOK_ENCRYPTION_KEY with a 32-byte base64 key.');return key;};
export function encryptSecret(secret,key) {const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(key),iv);const ciphertext=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),ciphertext].map(v=>v.toString('base64')).join('.');}
export function decryptSecret(value,key) {const [iv,tag,data]=value.split('.').map(v=>Buffer.from(v,'base64'));const cipher=createDecipheriv('aes-256-gcm',encryptionKey(key),iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8');}
export const signWebhook=(secret,body,timestamp)=>'v1='+createHmac('sha256',secret).update(timestamp+'.').update(body).digest('hex');
export function verifyWebhook(secret,body,timestamp,signature,now=Date.now()) {
 if(!/^\d{10}$/.test(timestamp||'')||Math.abs(now/1000-Number(timestamp))>300||!/^v1=[a-f0-9]{64}$/.test(signature||''))return false;
 return timingSafeEqual(Buffer.from(signature),Buffer.from(signWebhook(secret,body,timestamp)));
}
export function isPublicAddress(address) {
 const version=isIP(address);
 if(version===4){const [a,b,c]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&[18,19].includes(b)||a===192&&b===0||a===198&&b===51&&c===100||a===203&&b===0&&c===113);}
 if(version===6){const value=address.toLowerCase();return /^[23][0-9a-f]{3}:/.test(value)&&!/^2001:(?:db8|0{0,4}):/.test(value)&&!value.startsWith('2002:');}
 return false;
}
export function webhookUrl(value) {
 let url;try{url=new URL(value);}catch{throw new HttpError(400,'Enter an HTTPS webhook URL.');}
 const host=url.hostname.replace(/^\[|\]$/g,'');
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||!host.includes('.')&&isIP(host)!==6||/^(localhost|.*\.localhost|.*\.local)$/i.test(host)||isIP(host)&&!isPublicAddress(host))throw new HttpError(400,'Use a public HTTPS endpoint on port 443.');
 return url;
}
export async function deliverWebhook(job,{resolve=lookup,request=https.request}={}) {
 const url=webhookUrl(job.endpoint),host=url.hostname.replace(/^\[|\]$/g,'');
 let addresses, timer;
 try { addresses=isIP(host)?[{address:host,family:isIP(host)}]:await Promise.race([resolve(host,{all:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Webhook DNS timed out.')),3000);})]); }
 finally { clearTimeout(timer); }
 if(!addresses.length||addresses.some(row=>!isPublicAddress(row.address)))throw new Error('Webhook DNS target is not public.');
 const pinned=addresses[0],body=Buffer.from(JSON.stringify(job.event)),timestamp=String(Math.floor(Date.now()/1000)),secret=decryptSecret(job.encryptedSecret);
 return new Promise((resolveResult,reject)=>{
  const req=request(url,{method:'POST',headers:{'Content-Type':'application/json','Content-Length':body.length,'Webhook-Id':job.event.id,'Webhook-Timestamp':timestamp,'Webhook-Signature':signWebhook(secret,body,timestamp)},lookup:(_hostname,options,done)=>options.all?done(null,[pinned]):done(null,pinned.address,pinned.family),timeout:10000,signal:AbortSignal.timeout(10000)},res=>{res.destroy();resolveResult(res.statusCode);});
  req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('Webhook delivery timed out.')));req.end(body);
 });
}
const admin=access=>{if(!access?.workspace?.id||!['owner','admin'].includes(access.role))throw new HttpError(403,'A workspace administrator is required.');};
export function createWebhookService({database=raw,deliver=deliverWebhook}={}) {
 return {
  async list(access) {
   admin(access);
   const endpoints=await integrationQuery(database().from('workspace_webhooks').select('id,endpoint,events,enabled,created_at').eq('workspace_id',access.workspace.id).order('created_at',{ascending:false}));
   const ids=endpoints.map(row=>row.id);
   const deliveries=ids.length?await integrationQuery(database().from('webhook_deliveries').select('id,webhook_id,state,attempts,response_status,last_error,next_attempt_at,created_at').in('webhook_id',ids).order('created_at',{ascending:false}).limit(100)):[];
   return {endpoints,deliveries,encryptionConfigured:Buffer.from(process.env.WEBHOOK_ENCRYPTION_KEY||'','base64').length===32};
  },
  async change(access,input) {
   admin(access);let secret;const payload={};
   if(input?.action==='create'){
    payload.endpoint=webhookUrl(input.endpoint).href;
    if(!Array.isArray(input.events)||!input.events.length||input.events.some(v=>!WEBHOOK_EVENTS.includes(v)))throw new HttpError(400,'Choose supported webhook events.');
    payload.events=[...new Set(input.events)];secret=randomBytes(32).toString('hex');payload.encryptedSecret=encryptSecret(secret);
   }else if(['toggle','retry'].includes(input?.action)){
    if(!uuidValid(input.id))throw new HttpError(400,'Choose an endpoint or failed delivery.');
    payload.id=input.id;if(input.action==='toggle'){if(typeof input.enabled!=='boolean')throw new HttpError(400,'Choose enable or disable.');payload.enabled=input.enabled;}
   }else throw new HttpError(400,'Choose a webhook action.');
   const result=await integrationQuery(database().rpc('manage_workspace_webhook',{p_actor:access.actorId,p_workspace:access.workspace.id,p_action:input.action,p_input:payload}));
   return {...result,...(secret?{secret}:{})};
  },
  async drain(workspaceId=null) {
   const jobs=await integrationQuery(database().rpc('claim_webhook_deliveries',{p_limit:5,p_workspace:workspaceId}));
   const results=await Promise.all(jobs.map(async job=>{
    let status=null,error=null;try{status=await deliver(job);if(status<200||status>=300)error='Endpoint returned HTTP '+status+'.';}catch{error='Endpoint DNS, TLS or delivery failed.';}
    const saved=await integrationQuery(database().rpc('finish_webhook_delivery',{p_id:job.id,p_lease:job.lease,p_status:status,p_error:error}));
    return {id:job.id,delivered:status>=200&&status<300,recorded:saved};
   }));
   return {processed:results.length,results};
  },
 };
}

