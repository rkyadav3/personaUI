import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { serverSetupCode } from '../src/lib/websiteSetup.js';
import { createIntegrationService } from '../server/integrations.js';
import { scriptedDatabase, hasEq, step } from './support/database.js';

const workspace = '11111111-1111-4111-8111-111111111111', site = '22222222-2222-4222-8222-222222222222';
const access = { role: 'owner', workspace: { id: workspace } };
test('website connection checks reveal only the latest successful timestamp for the authorized connection', async () => {
  const db = scriptedDatabase({ table: 'website_integrations', data: [{ id: site }] }, { table: 'persona_requests', data: [{ completed_at: '2026-11-16T00:00:00Z' }] });
  const result = await createIntegrationService({ database: () => db }).status(access, { id: site });
  assert.deepEqual(result, { lastRequest: '2026-11-16T00:00:00Z' });
  assert.ok(hasEq(db.calls[0], 'workspace_id', workspace));
  for (const [column, value] of [['workspace_id', workspace], ['integration_id', site], ['source', 'external_api'], ['state', 'complete']]) assert.ok(hasEq(db.calls[1], column, value));
  assert.deepEqual(step(db.calls[1], 'select'), ['completed_at']);
});
test('website connection checks deny viewers, invalid IDs and foreign connections before reading requests', async () => {
  const db = scriptedDatabase({ table: 'website_integrations', data: [] });
  const service = createIntegrationService({ database: () => db });
  await assert.rejects(service.status({ ...access, role: 'viewer' }, { id: site }), error => error.status === 403);
  await assert.rejects(service.status(access, { id: 'bad' }), error => error.status === 400);
  assert.equal(db.calls.length, 0);
  await assert.rejects(service.status(access, { id: site }), error => error.status === 404);
  assert.equal(db.calls.length, 1);
});
test('downloadable Vercel and Next.js handlers keep credentials server-side and preserve upstream errors', async () => {
  const source = await readFile(new URL('../examples/persona-proxy.js', import.meta.url), 'utf8');
  const names = ['PERSONA_API_URL', 'PERSONA_API_KEY', 'SITE_ORIGIN'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]])), previousFetch = globalThis.fetch;
  try {
    process.env.PERSONA_API_URL = 'https://persona.example.test/api/persona'; process.env.PERSONA_API_KEY = 'ps_fixture_secret'; process.env.SITE_ORIGIN = 'https://customer.example.test';
    let sent;
    globalThis.fetch = async (url, options) => { sent = { url, options }; return Response.json({ error: 'Limit reached' }, { status: 429, headers: { 'Retry-After': '60' } }); };
    for (const platform of ['vercel', 'next']) {
      const code = serverSetupCode(source, platform);
      assert.ok(!code.includes(process.env.PERSONA_API_KEY));
      const module = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
      const invoke = async (origin = process.env.SITE_ORIGIN, message = 'Hello') => {
        const body = { message, requestId: 'unique-id', workspaceId: 'foreign', source: 'own_platform' };
        if (platform === 'next') { const response = await module.POST(new Request('https://customer.example.test/api/persona-proxy', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })); return { status: response.status, headers: Object.fromEntries(response.headers), body: await response.json() }; }
        const result = { headers: {}, setHeader(name, value) { this.headers[name.toLowerCase()] = value; }, status(status) { this.code = status; return this; }, json(value) { this.body = value; return this; } };
        await module.default({ method: 'POST', headers: { origin, 'content-type': 'application/json' }, body }, result);
        return { status: result.code, headers: result.headers, body: result.body };
      };
      const reply = await invoke();
      assert.equal(reply.status, 429); assert.equal(reply.headers['retry-after'], '60'); assert.equal(reply.headers['cache-control'], 'no-store');
      assert.equal(sent.options.headers.Authorization, 'Bearer ps_fixture_secret');
      assert.deepEqual(JSON.parse(sent.options.body), { op: 'chat', message: 'Hello', requestId: 'unique-id' });
      sent = null; assert.equal((await invoke('https://attacker.example.test')).status, 403); assert.equal(sent, null);
      assert.equal((await invoke(process.env.SITE_ORIGIN, 'x'.repeat(501))).status, 400);
      delete process.env.PERSONA_API_KEY; assert.equal((await invoke()).status, 503); process.env.PERSONA_API_KEY = 'ps_fixture_secret';
    }
  } finally { globalThis.fetch = previousFetch; for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
});
