// Copy to your website's api/persona-proxy.js (Vercel Node serverless).
// Environment: PERSONA_API_URL=https://your-persona-host/api/persona
// PERSONA_API_KEY=<secret from Website connections>; SITE_ORIGIN=https://your-website.com
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.SITE_ORIGIN || req.headers.origin !== process.env.SITE_ORIGIN || !String(req.headers['content-type'] || '').startsWith('application/json')) return res.status(403).json({ error: 'This browser request is not allowed.' });
  // For a private chatbot, enforce your site's authenticated visitor session here.
  // Origin is a browser CSRF guard; it does not prove that the caller is human.
  const { message, requestId } = req.body || {};
  if (typeof message !== 'string' || !message.trim() || message.length > 500 || typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(requestId)) return res.status(400).json({ error: 'Write a question of up to 500 characters.' });
  try {
    const apiUrl=new URL(process.env.PERSONA_API_URL);
    if(apiUrl.protocol!=='https:') throw new Error('Invalid server configuration');
    const upstream=await fetch(apiUrl,{method:'POST',headers:{Authorization:'Bearer '+process.env.PERSONA_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({op:'chat',message,requestId}),signal:AbortSignal.timeout(25000)});
    const data=await upstream.json();
    if(upstream.headers.get('retry-after'))res.setHeader('Retry-After',upstream.headers.get('retry-after'));
    return res.status(upstream.status).json(data);
  }catch{return res.status(502).json({error:'Persona is temporarily unavailable. Please try again.'});}
}

