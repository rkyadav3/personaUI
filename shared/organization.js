import { CATEGORIES, INTENTS } from './profileSchema.js';

export const ORGANIZATION_TYPES = { company: 'Company', school: 'School', college: 'College / university', nonprofit: 'Nonprofit', association: 'Association', other: 'Other organization' };
export const ORGANIZATION_FIELDS = {
  company: [['industry', 'Industry'], ['services', 'Products and services'], ['customers', 'Who you serve'], ['supportHours', 'Support hours']],
  school: [['board', 'Education board'], ['grades', 'Classes offered'], ['admissions', 'Admissions process'], ['fees', 'Fee information'], ['facilities', 'Facilities']],
  college: [['courses', 'Courses and departments'], ['eligibility', 'Eligibility'], ['admissions', 'Admissions process'], ['affiliation', 'Affiliation / accreditation'], ['scholarships', 'Scholarships']],
  nonprofit: [['programs', 'Programs'], ['beneficiaries', 'Who you support'], ['impact', 'Impact'], ['volunteering', 'Volunteering']],
  association: [['programs', 'Programs'], ['membership', 'Membership'], ['participation', 'How to participate']],
  other: [['programs', 'Programs and services'], ['participation', 'How to participate']],
};
export const ORGANIZATION_QUESTIONS = {
  name: 'What is your organization called?',
  type: 'What type of organization is this?',
  purpose: 'What does your organization do?',
  audience: 'Who should your persona help?',
  chatPurpose: 'What should your persona help people understand?',
  website: 'Would you like to add your official website?',
  contact: 'Which contact details would you like to publish?',
};
const text = (value, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const strings = value => [...new Set((Array.isArray(value) ? value : []).map(v => text(v, 80)).filter(Boolean))].slice(0, 20);
const website = value => {
  try { const url = new URL(text(value, 500)); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
};

export function normalizeOrganization(input = {}) {
  const type = Object.hasOwn(ORGANIZATION_TYPES, input.type) ? input.type : '';
  const year = Number(input.foundedYear);
  return {
    type, website: website(input.website), mission: text(input.mission, 1500),
    audience: text(input.audience, 500), chatPurpose: text(input.chatPurpose, 1000),
    foundedYear: Number.isInteger(year) && year >= 1000 && year <= 2100 ? year : null,
    locations: strings(input.locations),
    details: Object.fromEntries((ORGANIZATION_FIELDS[type] || []).map(([key]) => [key, text(input.details?.[key])]).filter(([, value]) => value)),
  };
}

export function normalizeOrganizationDraft(input = {}) {
  const p = input.profile || {}, contact = p.contact || {};
  return {
    profile: {
      name: text(p.name, 120) || null, education: [], designation: null,
      contact: { email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email || '') ? text(contact.email, 160) : null,
        phone: text(contact.phone, 40) || null, location: text(contact.location, 160) || null, other: text(contact.other, 300) || null },
      experience: { total_years: null, description: '', employers: [] },
      expertise: strings(p.expertise), organization: normalizeOrganization(p.organization),
    },
    purpose: {
      description: text(input.purpose?.description, 1500),
      contributions: (Array.isArray(input.purpose?.contributions) ? input.purpose.contributions : [])
        .filter(item => CATEGORIES.includes(item?.category)).slice(0, 12)
        .map(item => ({ category: item.category, subtype: item.category === 'Other Contributions' ? text(item.subtype, 80) : '',
          description: text(item.description, 600), intent: INTENTS.includes(item.intent) ? item.intent : 'unspecified' })),
    },
  };
}

export function organizationMissing(draft) {
  const required = [], optional = [], p = draft.profile, org = p.organization;
  if (!p.name?.trim()) required.push('name');
  if (!org?.type) required.push('type');
  if (!draft.purpose?.description?.trim()) required.push('purpose');
  if (!org?.audience?.trim()) required.push('audience');
  if (!org?.chatPurpose?.trim()) required.push('chatPurpose');
  if (!org?.website) optional.push('website');
  if (!p.contact?.email && !p.contact?.phone) optional.push('contact');
  return { required, optional };
}

export function publicOrganization(profile, visibility) {
  return visibility.organization === false ? null : normalizeOrganization(profile.organization);
}

export function validPublicSource(source, now = Date.now()) {
  return (!source.audience || source.audience === 'public') &&
    (!source.valid_from || (Number.isFinite(Date.parse(source.valid_from)) && Date.parse(source.valid_from) <= now)) &&
    (!source.valid_until || (Number.isFinite(Date.parse(source.valid_until)) && Date.parse(source.valid_until) > now));
}
