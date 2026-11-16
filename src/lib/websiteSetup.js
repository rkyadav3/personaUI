export function serverSetupCode(source, platform) {
  if (platform !== 'next') return source;
  return `${source.replace('export default async function handler', 'async function handler')}
export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Send a valid JSON question.' }, { status: 400 }); }
  const headers = {};
  const res = {
    code: 200,
    setHeader(name, value) { headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(data) { return Response.json(data, { status: this.code, headers }); }
  };
  return handler({ method: request.method, headers: Object.fromEntries(request.headers), body }, res);
}
`;
}
