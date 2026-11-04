// Date helpers for updates and the schedule. Times are stored in UTC and shown in the viewer's own time zone.
const fmt = (iso, o) => new Date(iso).toLocaleString(undefined, o);
export const fmtDay = iso => fmt(iso, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const fmtTime = iso => fmt(iso, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
export const fmtStamp = iso => (iso ? fmt(iso, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

/** "Sat, 14 Nov 2026 · 6:00 PM IST" or, for a same-day range, "… · 6:00 PM to 7:30 PM IST". */
export function fmtRange(x) {
  if (!x.startsAt) return '';
  if (!x.endsAt) return `${fmtDay(x.startsAt)} · ${fmtTime(x.startsAt)}`;
  const sameDay = new Date(x.startsAt).toDateString() === new Date(x.endsAt).toDateString();
  return sameDay
    ? `${fmtDay(x.startsAt)} · ${fmt(x.startsAt, { hour: 'numeric', minute: '2-digit' })} to ${fmtTime(x.endsAt)}`
    : `${fmtDay(x.startsAt)} ${fmt(x.startsAt, { hour: 'numeric', minute: '2-digit' })} to ${fmtDay(x.endsAt)} ${fmtTime(x.endsAt)}`;
}

/** A Google Calendar "add event" link for one schedule item (an event without an end time is given one hour). */
export function calendarUrl(x) {
  const z = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = x.endsAt || new Date(new Date(x.startsAt).getTime() + 3600e3).toISOString();
  const q = new URLSearchParams({ action: 'TEMPLATE', text: x.title, dates: `${z(x.startsAt)}/${z(end)}`, details: x.body || '', location: x.location || '' });
  return `https://calendar.google.com/calendar/render?${q}`;
}

// <input type="datetime-local"> works in local time without a zone; these convert to and from the stored UTC value.
const p2 = n => String(n).padStart(2, '0');
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
export const fromLocalInput = s => { if (!s) return ''; const d = new Date(s); return Number.isNaN(d.getTime()) ? '' : d.toISOString(); };
