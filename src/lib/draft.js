import { CATEGORIES } from '../../shared/profileSchema.js';

export const emptyDraft = () => ({
  profile: { name: null, education: [], contact: { email: null, phone: null, location: null, other: null },
    experience: { total_years: null, description: '', employers: [] }, designation: null, expertise: [] },
  purpose: { description: '', contributions: [] },
});

const filled = v => (Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.values(v).some(filled) : v !== null && v !== '' && v !== undefined);

/** When the AI is re-run with extra details: keep anything the person already has, fill only the gaps. */
export function mergeDraft(cur, fresh) {
  const out = structuredClone(cur);
  for (const k of ['name', 'designation', 'education', 'expertise']) if (!filled(out.profile[k])) out.profile[k] = fresh.profile[k];
  for (const k of Object.keys(out.profile.contact)) if (!out.profile.contact[k]) out.profile.contact[k] = fresh.profile.contact[k];
  const x = out.profile.experience, f = fresh.profile.experience;
  if (x.total_years == null) x.total_years = f.total_years;
  if (!x.description) x.description = f.description;
  if (!x.employers.length) x.employers = f.employers;
  if (!out.purpose.description) out.purpose.description = fresh.purpose.description;
  const key = k => `${k.category}|${(k.subtype || '').toLowerCase()}`, have = new Set(out.purpose.contributions.map(key));
  for (const k of fresh.purpose.contributions) if (!have.has(key(k))) out.purpose.contributions.push(k);
  return out;
}

export function missing(d) {
  const required = [], optional = [];
  if (!d.profile.name?.trim()) required.push('name');
  if (!d.purpose.description.trim() && !d.purpose.contributions.length) required.push('purpose');
  if (!d.profile.education.length) optional.push('education');
  if (!d.profile.contact.email && !d.profile.contact.phone) optional.push('contact');
  if (!d.profile.experience.description && d.profile.experience.total_years == null && !d.profile.experience.employers.length) optional.push('experience');
  if (!d.profile.designation) optional.push('designation');
  if (!d.profile.expertise.length) optional.push('expertise');
  return { required, optional };
}

export const QUESTIONS = {
  name: 'What is your full name?',
  purpose: 'What would you like to contribute or offer through this platform?',
  education: 'Add your education? (optional)', contact: 'Add an email or phone? It stays private unless you publish it. (optional)',
  experience: 'Add your work experience? (optional)', designation: 'What is your current designation? (optional)', expertise: 'What are your main areas of expertise? (optional)',
};

export const nextCategory = list => CATEGORIES.find(c => !list.some(k => k.category === c)) || 'Other Contributions';
