// Updates, schedule and enquiries: one place that decides what is valid. The admin pages, the public form and the
// server all call these, so nothing unchecked reaches the database or the page.
import { cleanUrl } from './portfolio.js';
import { CONTACT_METHODS, ENQUIRY_TYPES, MEETING_MODES, SCHEDULING_TYPES, TIME_SLOTS } from './enquiryTypes.js';

export const UPDATE_KINDS = { update: 'Upcoming update', schedule: 'Schedule' };

const txt = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const long = (v, n) => (typeof v === 'string' ? v.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, n) : '');
const pick = (v, allowed) => (allowed.includes(v) ? v : '');
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Any date input -> ISO string, or null when it is empty or not a real date. */
export function iso(v) {
  if (v == null || v === '') return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100 ? d.toISOString() : null;
}

/** What an admin may post. Title is checked by `updateProblem`. */
export function normalizeUpdate(i) {
  i = i && typeof i === 'object' ? i : {};
  const kind = i.kind === 'schedule' ? 'schedule' : 'update';
  const startsAt = iso(i.startsAt), endsAt = iso(i.endsAt);
  return {
    kind, title: txt(i.title, 120), body: long(i.body, 2000),
    startsAt, endsAt: kind === 'schedule' && startsAt && endsAt && endsAt >= startsAt ? endsAt : null,
    location: txt(i.location, 160), url: cleanUrl(i.url), linkLabel: txt(i.linkLabel, 24),
    status: i.status === 'published' ? 'published' : 'draft', pinned: kind === 'update' && i.pinned === true,
  };
}
export const updateProblem = v => (!v.title ? 'Give it a title.' : v.kind === 'schedule' && !v.startsAt ? 'A schedule item needs a start date and time.' : '');

const END_PAD = 3 * 3600e3;   // an event without an end time counts as running for 3 hours
const endMs = x => (x.endsAt ? new Date(x.endsAt).getTime() : new Date(x.startsAt).getTime() + END_PAD);

/** Schedule items -> still to come (soonest first, includes the one happening now) and already over (latest first). */
export function splitSchedule(items, now = Date.now()) {
  const list = (items || []).filter(x => x.startsAt);
  return {
    upcoming: list.filter(x => endMs(x) >= now).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    past: list.filter(x => endMs(x) < now).sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
  };
}

/** Rows from the `updates` table -> exactly what visitors may see. Drafts never pass. Old events (60+ days) drop out. */
export function shapeEngage(rows, now = Date.now()) {
  const pub = (rows || []).filter(r => r.status === 'published');
  const view = r => ({
    id: r.id, kind: r.kind, title: r.title, body: r.body || '', startsAt: r.starts_at || null, endsAt: r.ends_at || null,
    location: r.location || '', url: cleanUrl(r.url), linkLabel: r.link_label || '', pinned: !!r.pinned, createdAt: r.created_at || null,
  });
  const updates = pub.filter(r => r.kind === 'update').map(view)
    .sort((a, b) => (b.pinned - a.pinned) || String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 30);
  const floor = new Date(now - 60 * 86400e3).toISOString();
  const schedule = pub.filter(r => r.kind === 'schedule' && r.starts_at && r.starts_at >= floor).map(view)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 60);
  return { updates, schedule };
}

/** The enquiry form. Returns { ok, value, errors }; the browser shows `errors` next to the fields, the server refuses on them. */
export function normalizeEnquiry(i, { types } = {}) {
  i = i && typeof i === 'object' ? i : {};
  const allowed = types?.length ? types.filter(t => ENQUIRY_TYPES[t]) : Object.keys(ENQUIRY_TYPES);
  const id = Number(i.offeringId);
  const v = {
    name: txt(i.name, 100), email: txt(i.email, 160).toLowerCase(), phone: txt(i.phone, 40),
    organisation: txt(i.organisation, 120), location: txt(i.location, 120),
    kind: pick(i.kind, Object.keys(ENQUIRY_TYPES)), offeringId: Number.isSafeInteger(id) && id > 0 ? id : null,
    subject: txt(i.subject, 120), message: long(i.message, 2000),
    prefDate: /^\d{4}-\d{2}-\d{2}$/.test(i.prefDate || '') && Number.isFinite(Date.parse(i.prefDate)) ? i.prefDate : '',
    prefTime: pick(i.prefTime, TIME_SLOTS), prefContact: pick(i.prefContact, CONTACT_METHODS),
    meetingMode: pick(i.meetingMode, MEETING_MODES), budget: txt(i.budget, 60), consent: i.consent === true,
  };
  if (!SCHEDULING_TYPES.includes(v.kind)) { v.prefDate = ''; v.prefTime = ''; v.meetingMode = ''; v.budget = ''; }   // hidden fields never carry stale values
  const e = {};
  if (v.name.length < 2) e.name = 'Please enter your name.';
  if (!EMAIL_RE.test(v.email)) e.email = 'Enter a valid email address.';
  if (v.phone && v.phone.replace(/\D/g, '').length < 7) e.phone = 'That phone number looks too short.';
  if (['Phone call', 'WhatsApp'].includes(v.prefContact) && !v.phone) e.phone = `Add a phone number so ${v.prefContact === 'WhatsApp' ? 'WhatsApp' : 'a call'} works.`;
  if (!v.kind || !allowed.includes(v.kind)) e.kind = 'Choose what your enquiry is about.';
  if (v.subject.length < 3) e.subject = 'Add a short subject.';
  if (v.message.length < 10) e.message = 'Tell us a little more (at least 10 characters).';
  if (i.prefDate && !v.prefDate && SCHEDULING_TYPES.includes(v.kind)) e.prefDate = 'Pick a valid date.';
  else if (v.prefDate && (v.prefDate < new Date(Date.now() - 86400e3).toISOString().slice(0, 10) || v.prefDate > new Date(Date.now() + 730 * 86400e3).toISOString().slice(0, 10))) e.prefDate = 'Choose a date from today up to two years ahead.';
  if (!v.consent) e.consent = 'Please tick the box so we may reply to you.';
  return { ok: !Object.keys(e).length, value: v, errors: e };
}
