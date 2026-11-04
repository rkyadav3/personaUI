import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const mod = await import('../server/rsvpService.js').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; });

function fixture(patch = {}) {
  const rows = [], event = { id: 8, owner_id: 'owner-a', kind: 'event', status: 'published', starts_at: '2026-12-10T10:00:00Z', rsvp: { enabled: true, showAttendees: true }, ...patch };
  const repo = {
    owner: async slug => slug === 'alice' ? { id: 'owner-a', slug } : { id: 'owner-b', slug },
    event: async (owner, id) => owner === event.owner_id && id === 8 ? event : null,
    claim: async () => {},
    summary: async () => ({ going: 2, notGoing: 1, goingNames: ['First Visitor'], notGoingNames: ['Second Visitor'], email: 'private@example.test', phone: 'private' }),
    save: async (owner, id, value, hash) => {
      let row = rows.find(r => r.email === value.email);
      if (row && row.token_hash !== hash) throw new Error('A response using this email already exists.');
      if (!row) { row = { id: rows.length + 1, owner_id: owner, event_id: id }; rows.push(row); }
      Object.assign(row, value, { token_hash: hash }); return row;
    },
  };
  assert.equal(typeof mod.createRsvpService, 'function', 'The event response service has not been implemented.');
  return { service: mod.createRsvpService({ repo, clock: () => Date.parse('2026-11-04T12:00:00Z') }), rows, repo };
}
const input = { slug: 'alice', eventId: 8, name: 'Visitor', email: 'visitor@example.test', response: 'going', publicName: true };

test('a response is saved under the event owner and returns a private edit capability', async () => {
  const { service, rows } = fixture(), result = await service.submit(input);
  assert.equal(rows[0].owner_id, 'owner-a'); assert.equal(rows[0].response, 'going');
  assert.equal(rows[0].token_hash, createHash('sha256').update(result.editToken).digest('hex'));
});

test('the private edit token updates an existing response instead of duplicating it', async () => {
  const { service, rows } = fixture(), first = await service.submit(input);
  await service.submit({ ...input, editToken: first.editToken, response: 'not_going' });
  assert.equal(rows.length, 1); assert.equal(rows[0].response, 'not_going');
  await assert.rejects(service.submit(input), /already exists/i);
});

test('another profile cannot accept responses for this owner’s event', async () => {
  const { service, rows } = fixture(); await assert.rejects(service.submit({ ...input, slug: 'bob' }), /not found/i); assert.equal(rows.length, 0);
});

test('draft, closed and past events reject new responses', async () => {
  for (const patch of [{ status: 'draft' }, { rsvp: { enabled: false } }, { starts_at: '2026-10-01T10:00:00Z' }]) {
    const { service, rows } = fixture(patch); await assert.rejects(service.submit(input), /not found|closed|accepting/i); assert.equal(rows.length, 0);
  }
});

test('the public attendance summary contains counts and names, never contact details', async () => {
  const { service } = fixture(), result = await service.summary({ slug: 'alice', eventId: 8 });
  assert.equal(result.going, 2); assert.deepEqual(result.goingNames, ['First Visitor']); assert.doesNotMatch(JSON.stringify(result), /private@example|phone/);
  const hidden = fixture({ rsvp: { enabled: true, showAttendees: false } });
  assert.deepEqual((await hidden.service.summary({ slug: 'alice', eventId: 8 })).goingNames, []);
});

test('invalid responses, edit tokens and event identifiers fail without writing', async () => {
  const f = fixture();
  for (const patch of [{ eventId: 0 }, { slug: 'bad/slug' }, { email: 'bad' }, { editToken: 'bad' }]) await assert.rejects(f.service.submit({ ...input, ...patch }), e => [400, 404].includes(e.status));
  assert.deepEqual(await f.service.submit({ website: 'bot-field' }), { ok: true }); assert.equal(f.rows.length, 0);
});

test('summary failures never masquerade as empty attendance lists', async () => {
  const f = fixture(); f.repo.summary = async () => null;
  await assert.rejects(f.service.summary({ slug: 'alice', eventId: 8 }), e => e.status === 503);
  f.repo.summary = async () => ({ going: 2, notGoing: 0, goingNames: [null, 'Valid name'], notGoingNames: null });
  assert.deepEqual((await f.service.summary({ slug: 'alice', eventId: 8 })).goingNames, ['Valid name']);
});
