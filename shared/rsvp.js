import { normalizeEventForm } from './engage.js';
const text = (v, n) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';

export function normalizeRsvp(input = {}, settings = {}) {
  const form = normalizeEventForm(settings);
  const value = {
    name: text(input?.name, 100), email: text(input?.email, 160).toLowerCase(), phone: text(input?.phone, 40),
    response: ['going', 'not_going'].includes(input?.response) ? input.response : '', publicName: input?.publicName === true,
    note: text(input?.note, 500), answers: form.questions.map(q => ({ id: q.id, label: q.label, value: text(input?.answers?.[q.id], 500) })),
  };
  const errors = Object.create(null);
  if (value.name.length < 2) errors.name = 'Please enter your name.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.email)) errors.email = 'Enter a valid email address.';
  if (!value.response) errors.response = 'Choose Going or Not going.';
  if ((form.requirePhone && !value.phone) || (value.phone && value.phone.replace(/\D/g, '').length < 7)) errors.phone = 'Enter a valid phone number.';
  for (const q of form.questions) if (q.required && !value.answers.find(a => a.id === q.id)?.value) errors[q.id] = 'Please answer this question.';
  return { ok: !Object.keys(errors).length, value, errors };
}
