import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUpdate, shapeEngage, updateProblem } from '../shared/engage.js';
import { TENANT_TABLES } from '../server/tenant.js';

test('an Event remains an Event and retains its end time and response form', () => {
  const event = normalizeUpdate({ kind: 'event', title: 'Meetup', startsAt: '2026-12-10T10:00:00Z', endsAt: '2026-12-10T12:00:00Z', status: 'published', rsvp: { enabled: true, requirePhone: true, showAttendees: false, questions: [{ id: 'topic', label: 'What would you like to discuss?', required: true }] } });
  assert.equal(event.kind, 'event');
  assert.equal(event.endsAt, '2026-12-10T12:00:00.000Z');
  assert.equal(event.rsvp.requirePhone, true);
  assert.equal(event.rsvp.showAttendees, false);
  assert.equal(event.rsvp.questions[0].id, 'topic');
});

test('an Event requires a start date', () => {
  assert.match(updateProblem(normalizeUpdate({ kind: 'event', title: 'Meetup' })), /start date/i);
});

test('the public page includes published Events and excludes drafts', () => {
  const rows = [{ id: 1, kind: 'event', title: 'Visible meetup', status: 'published', starts_at: '2026-12-10T10:00:00Z', rsvp: { enabled: true } }, { id: 2, kind: 'event', title: 'Private meetup', status: 'draft', starts_at: '2026-12-11T10:00:00Z' }];
  const view = shapeEngage(rows, Date.parse('2026-11-04T12:00:00Z'));
  assert.deepEqual(view.events.map(x => x.id), [1]);
  assert.equal(view.events[0].rsvp.enabled, true);
});

test('event responses, purchases and payment credentials are tenant tables', () => {
  for (const table of ['event_responses', 'purchases', 'payment_accounts', 'public_actions']) assert.equal(TENANT_TABLES.has(table), true, table);
});
