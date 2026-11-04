import { randomBytes } from 'node:crypto';
import { normalizeEventForm } from '../shared/engage.js';
import { normalizeRsvp } from '../shared/rsvp.js';
import { validReceiptToken } from '../shared/commerce.js';
import { hashToken } from './paymentCrypto.js';
import { HttpError } from './http.js';

export function createRsvpService({ repo, clock = Date.now }) {
  async function context(input) {
    const id = Number(input?.eventId);
    if (!/^[a-z0-9-]{1,80}$/.test(input?.slug || '') || !Number.isSafeInteger(id) || id <= 0) throw new HttpError(404, 'Event not found.');
    const owner = await repo.owner(input.slug), event = owner && await repo.event(owner.id, id);
    if (!event || event.owner_id !== owner.id || event.kind !== 'event' || event.status !== 'published') throw new HttpError(404, 'Event not found.');
    const form = normalizeEventForm(event.rsvp), end = Date.parse(event.ends_at || '') || Date.parse(event.starts_at || '') + 3 * 3600e3;
    return { owner, event, form, accepting: form.enabled && Number.isFinite(end) && end >= clock() };
  }
  return {
    async summary(input) {
      const { owner, event, form, accepting } = await context(input), result = await repo.summary(owner.id, event.id);
      if (!result || !Number.isSafeInteger(Number(result.going)) || !Number.isSafeInteger(Number(result.notGoing))) throw new HttpError(503, 'Attendance could not be loaded. Please try again.');
      const names = list => (Array.isArray(list) ? list : []).filter(n => typeof n === 'string').slice(0, 200).map(n => n.slice(0, 100));
      return { going: Number(result.going), notGoing: Number(result.notGoing), goingNames: form.showAttendees ? names(result.goingNames) : [], notGoingNames: form.showAttendees ? names(result.notGoingNames) : [], accepting };
    },
    async submit(input, { ip = 'anon' } = {}) {
      if (input?.website) return { ok: true };
      const { owner, event, form, accepting } = await context(input);
      if (!accepting) throw new HttpError(403, 'This event is no longer accepting responses.');
      const result = normalizeRsvp(input, form);
      if (!result.ok) throw new HttpError(400, 'Please check the response form.', result.errors);
      if (input.editToken && !validReceiptToken(input.editToken)) throw new HttpError(400, 'Invalid edit receipt. Use the browser where you sent your response.');
      const token = input.editToken || randomBytes(32).toString('base64url');
      await repo.claim(owner.id, 'rsvp', ip);
      await repo.save(owner.id, event.id, result.value, hashToken(token));
      return { ok: true, editToken: token, response: result.value.response };
    },
  };
}
