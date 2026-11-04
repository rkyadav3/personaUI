import { raw } from './supabase.js';
import { createPublicRepository, query } from './publicRepository.js';
import { createRsvpService } from './rsvpService.js';
import { HttpError } from './http.js';

const eventId = value => { const id = Number(value); if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Choose a valid event.'); return id; };
export function createEventRepository(database = raw) {
  return {
    ...createPublicRepository(database),
    event: async (owner, id) => (await query(database().from('updates').select('*').eq('owner_id', owner).eq('id', id).limit(1)))[0] || null,
    summary: (owner, id) => query(database().rpc('event_rsvp_summary', { p_owner: owner, p_event: id })),
    save: (owner, id, value, tokenHash) => query(database().rpc('save_event_response', { p_owner: owner, p_event: id, p_value: value, p_token_hash: tokenHash })),
  };
}
const service = () => createRsvpService({ repo: createEventRepository() });
export const attendanceSummary = input => service().summary(input);
export const submitAttendance = (input, meta) => service().submit(input, meta);

export async function listResponses(db, { eventId: input }) {
  const id = eventId(input), event = (await query(db.from('updates').select('id,kind').eq('id', id).limit(1)))[0];
  if (!event || event.kind !== 'event') throw new HttpError(404, 'Event not found.');
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const page = await query(db.from('event_responses').select('id,event_id,name,email,phone,response,public_name,note,answers,created_at,updated_at').eq('event_id', id).order('created_at', { ascending: false }).range(offset, offset + 499));
    rows.push(...page); if (page.length < 500) break;
  }
  return rows;
}
export async function deleteResponse(db, { eventId: input, id }) {
  await query(db.from('event_responses').delete().eq('event_id', eventId(input)).eq('id', eventId(id)));
  return { ok: true };
}
