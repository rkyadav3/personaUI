// Updates & schedule (posted by the admin, shown on the profile) and enquiries (sent by visitors, read in the admin).
// Admin functions take the tenant-scoped `db`, so they can only ever see and change the signed-in user's own rows.
// The one public write (submitEnquiry) checks everything again on the server and files the row under the profile's owner.
import { createHash } from 'node:crypto';
import { ENQUIRY_STATUS } from '../shared/enquiryTypes.js';
import { normalizeEnquiry, normalizeEventForm, normalizeUpdate, shapeEngage, updateProblem } from '../shared/engage.js';
import { normalizePortfolio } from '../shared/portfolio.js';
import { raw, run } from './supabase.js';
import { canViewProfile } from '../shared/governance.js';

const MAX_UPDATES = 300, MAX_PER_HOUR = 5;
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/** Point owners to the required migration instead of exposing a raw schema error. */
const friendly = e => /rsvp|updates_kind_check/i.test(e.message)
  ? new Error('Event setup is missing. Run supabase/events-commerce.sql after supabase/engage.sql in the Supabase SQL editor, then try again.')
  : /relation .*(updates|enquiries)|does not exist|schema cache/i.test(e.message)
    ? new Error('The database is missing the updates and enquiries tables. Run supabase/engage.sql, then supabase/events-commerce.sql in the Supabase SQL editor, then try again.') : e;
const guard = fn => async (...a) => { try { return await fn(...a); } catch (e) { throw friendly(e); } };

// ------------------------------------------------------------------ updates & schedule (admin)
const updateView = r => ({
  id: r.id, kind: r.kind, title: r.title, body: r.body, startsAt: r.starts_at, endsAt: r.ends_at, location: r.location,
  url: r.url, linkLabel: r.link_label, status: r.status, pinned: r.pinned, createdAt: r.created_at, updatedAt: r.updated_at, rsvp: r.kind === 'event' ? normalizeEventForm(r.rsvp) : undefined,
});

export const listUpdates = guard(async db => (await run(db.from('updates').select('*').order('created_at', { ascending: false }))).map(updateView));

export const saveUpdate = guard(async (db, a) => {
  const v = normalizeUpdate(a), problem = updateProblem(v);
  if (problem) throw new Error(problem);
  const row = { kind: v.kind, title: v.title, body: v.body, starts_at: v.startsAt, ends_at: v.endsAt, location: v.location, url: v.url, link_label: v.linkLabel, status: v.status, pinned: v.pinned, ...(v.kind === 'event' ? { rsvp: v.rsvp } : {}), updated_at: new Date().toISOString() };
  if (a.id) { await run(db.from('updates').update(row).eq('id', a.id)); return { id: a.id }; }
  const { count } = await run(db.from('updates').select('id', { count: 'exact' }).limit(1), true);
  if ((count || 0) >= MAX_UPDATES) throw new Error(`You have ${MAX_UPDATES} posts already. Delete old ones to add more.`);
  return (await run(db.from('updates').insert(row).select('id')))[0];
});

export const deleteUpdate = guard((db, id) => run(db.from('updates').delete().eq('id', id)));

// ------------------------------------------------------------------ what visitors see
/** Published rows only, shaped by shapeEngage. A missing table just means "nothing posted yet", never a broken page. */
export async function publicEngage(ownerId, db = raw()) {
  const rows = await run(db.from('updates').select('*').eq('owner_id', ownerId).eq('status', 'published')).catch(() => []);
  return shapeEngage(rows);
}
export async function previewEngage(db) {
  const rows = await run(db.from('updates').select('*').eq('status', 'published')).catch(() => []);
  return shapeEngage(rows);
}

// ------------------------------------------------------------------ enquiries (admin inbox)
const enquiryView = r => ({
  id: r.id, name: r.name, email: r.email, phone: r.phone, organisation: r.organisation, location: r.location,
  kind: r.kind, offeringId: r.offering_id, offeringTitle: r.offering_title, subject: r.subject, message: r.message,
  prefDate: r.pref_date, prefTime: r.pref_time, prefContact: r.pref_contact, meetingMode: r.meeting_mode, budget: r.budget,
  status: r.status, note: r.admin_note, createdAt: r.created_at,
});

export const listEnquiries = guard(async db => {
  const rows = (await run(db.from('enquiries').select('*').order('created_at', { ascending: false }).limit(500))).map(enquiryView);
  const counts = { total: rows.length, new: 0, read: 0, replied: 0, archived: 0 };
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
  return { rows, counts };
});

export const countNewEnquiries = async db => {
  try { const { count } = await run(db.from('enquiries').select('id', { count: 'exact' }).eq('status', 'new').limit(1), true); return { new: count || 0 }; }
  catch { return { new: 0 }; }   // the badge must never break the admin
};

export const updateEnquiry = guard(async (db, { id, status, note }) => {
  const patch = { updated_at: new Date().toISOString() };
  if (status !== undefined) { if (!ENQUIRY_STATUS.includes(status)) throw new Error('Unknown status.'); patch.status = status; }
  if (note !== undefined) patch.admin_note = str(note, 2000);
  await run(db.from('enquiries').update(patch).eq('id', id));
  return { ok: true };
});

export const deleteEnquiry = guard((db, id) => run(db.from('enquiries').delete().eq('id', id)));

// ------------------------------------------------------------------ enquiries (public form)
const ipHash = ip => createHash('sha256').update(`${process.env.SESSION_SECRET || ''}|enquiry|${ip}`).digest('hex').slice(0, 32);

/** Returns { ok:true } or { ok:false, status, error, errors? }. Nothing is stored unless every check passes. */
export async function submitEnquiry(body, { ip }, db = raw()) {
  if (body?.website) return { ok: true };   // the hidden "website" box: only bots fill it, so pretend it worked
  const slug = String(body?.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!slug) return { ok: false, status: 400, error: 'Something went wrong. Please reload the page.' };
  try {
    const [u] = await run(db.from('users').select('id,tags,profile_private,locked_until').eq('slug', slug).limit(1));
    if (!canViewProfile(u)) return { ok: false, status: 404, error: 'This profile is not available.' };
    const [p] = u ? await run(db.from('profiles').select('id').eq('owner_id', u.id).eq('status', 'published').limit(1)) : [];
    if (!u || !p) return { ok: false, status: 404, error: 'This profile is not available.' };

    const [site] = await run(db.from('site_settings').select('portfolio').eq('owner_id', u.id).limit(1)).catch(() => []);
    const cfg = normalizePortfolio(site?.portfolio).enquiry;
    if (!cfg.enabled) return { ok: false, status: 403, error: 'This member is not taking enquiries right now.' };

    const r = normalizeEnquiry(body, { types: cfg.types });
    if (!r.ok) return { ok: false, status: 400, error: Object.values(r.errors)[0], errors: r.errors };
    const v = r.value;

    let offeringId = null, offeringTitle = '';
    if (v.offeringId) {   // only an active offering of THIS member can be attached
      const [o] = await run(db.from('offerings').select('id,title,active').eq('id', v.offeringId).eq('owner_id', u.id).limit(1));
      if (o?.active) { offeringId = o.id; offeringTitle = o.title; }
    }

    const hash = ipHash(ip);
    const { count } = await run(db.from('enquiries').select('id', { count: 'exact' }).eq('ip_hash', hash).gte('created_at', new Date(Date.now() - 3600e3).toISOString()).limit(1), true);
    if ((count || 0) >= MAX_PER_HOUR) return { ok: false, status: 429, error: 'You have sent several enquiries already. Please try again a little later.' };

    const same = await run(db.from('enquiries').select('id').eq('owner_id', u.id).eq('email', v.email).eq('message', v.message).gte('created_at', new Date(Date.now() - 86400e3).toISOString()).limit(1));
    if (same.length) return { ok: true };   // a double click or a resend: already in the inbox

    await run(db.from('enquiries').insert({
      owner_id: u.id, name: v.name, email: v.email, phone: v.phone, organisation: v.organisation, location: v.location,
      kind: v.kind, offering_id: offeringId, offering_title: offeringTitle, subject: v.subject, message: v.message,
      pref_date: v.prefDate || null, pref_time: v.prefTime, pref_contact: v.prefContact, meeting_mode: v.meetingMode, budget: v.budget,
      consent: true, ip_hash: hash,
    }));
    return { ok: true };
  } catch (e) { throw friendly(e); }
}
