import test from 'node:test';
import assert from 'node:assert/strict';
import { saveUpdate } from '../server/engage.js';

function database(error) {
  let patch;
  const query = { eq() { return this; }, then(ok, fail) { return Promise.resolve({ data: [], error }).then(ok, fail); } };
  return { db: { from: () => ({ update(row) { patch = row; return query; } }) }, get patch() { return patch; } };
}
test('ordinary updates still save before the new Event migration is applied', async () => {
  const fixture = database();
  await saveUpdate(fixture.db, { id: 1, kind: 'update', title: 'News', status: 'published' });
  assert.equal(Object.hasOwn(fixture.patch, 'rsvp'), false);
});
test('Event saves persist their response form settings', async () => {
  const fixture = database();
  await saveUpdate(fixture.db, { id: 1, kind: 'event', title: 'Meetup', startsAt: '2026-12-10T10:00:00Z', rsvp: { requirePhone: true } });
  assert.equal(fixture.patch.rsvp.requirePhone, true);
});
test('missing Event columns point the owner to the Events and Commerce migration', async () => {
  const fixture = database({ message: "Could not find the 'rsvp' column of 'updates' in the schema cache" });
  await assert.rejects(saveUpdate(fixture.db, { id: 1, kind: 'event', title: 'Meetup', startsAt: '2026-12-10T10:00:00Z' }), /events-commerce\.sql/);
});
