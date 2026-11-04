import test from 'node:test';
import assert from 'node:assert/strict';
const mod = await import('../shared/rsvp.js').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; });
const normalize = (value, form) => { assert.equal(typeof mod.normalizeRsvp, 'function', 'The event response form validator has not been implemented.'); return mod.normalizeRsvp(value, form); };

test('the form accepts Going and normalizes contact details', () => {
  const r = normalize({ name: '  Visitor Name ', email: 'VISITOR@example.test', response: 'going', publicName: true }, { enabled: true });
  assert.equal(r.ok, true); assert.equal(r.value.email, 'visitor@example.test'); assert.equal(r.value.name, 'Visitor Name');
});

test('name, email and a valid attendance choice are required', () => {
  const r = normalize({ name: '', email: 'bad', response: 'maybe' });
  assert.equal(r.ok, false); assert.deepEqual(Object.keys(r.errors).sort(), ['email', 'name', 'response']);
});

test('required organizer questions and phone settings are enforced', () => {
  const r = normalize({ name: 'Visitor', email: 'visitor@example.test', response: 'not_going' }, { requirePhone: true, questions: [{ id: 'topic', label: 'Topic', required: true }] });
  assert.equal(r.ok, false); assert.ok(r.errors.phone); assert.ok(r.errors.topic);
});

test('custom answers are limited to organizer-defined fields', () => {
  const r = normalize({ name: 'Visitor', email: 'visitor@example.test', response: 'going', answers: { topic: 'Engineering', injected: 'should be ignored' } }, { questions: [{ id: 'topic', label: 'Topic' }] });
  assert.equal(r.ok, true); assert.deepEqual(r.value.answers, [{ id: 'topic', label: 'Topic', value: 'Engineering' }]);
});

test('reserved property names cannot bypass required custom answers', () => {
  const r = normalize({ name: 'Visitor', email: 'visitor@example.test', response: 'going' }, { questions: [{ id: '__proto__', label: 'Required answer', required: true }] });
  assert.equal(r.ok, false);
});
