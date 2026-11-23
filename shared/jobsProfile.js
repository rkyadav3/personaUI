export const JOBS_PROFILE_TYPE = 'jobs';
export const JOBS_PROFILE_SECTIONS = {
  basics: 'Basic Details',
  experience: 'Working Experience',
  mindset: 'Be Natural, Be Positive & Mindset',
  direction: 'Job, Family Business & Enterprise Development',
  business: 'Profit Making Business & Understanding',
  interests: 'Future Interest — Industry, Domain & Scope',
  nation: 'Ideas for Nation Growth',
  hustles: 'Side Hustles — Stories & Notes',
  inspiration: 'Inspirational Stories',
};
export const JOBS_PROFILE_KNOWLEDGE = Object.keys(JOBS_PROFILE_SECTIONS).filter(key => !['basics', 'experience'].includes(key));
export const JOBS_PROFILE_AUDIENCES = { private: 'Private', public: 'Public', applied_jobs: 'Applied jobs only' };
export const isJobsProfile = user => (user?.workspaceType ?? user?.profileType) === JOBS_PROFILE_TYPE || user?.jobSeeker === true || user?.permissions?.includes('job_seeker') === true;
export function normalizeJobsProfilePermissions(value) {
  if (!Array.isArray(value) || value.some(key => !Object.hasOwn(JOBS_PROFILE_SECTIONS, key))) throw new Error('Choose valid Jobs Profile sections.');
  return Object.keys(JOBS_PROFILE_SECTIONS).filter(key => value.includes(key));
}
export function resolveJobsProfilePermissions(tags, definitions) {
  const keys = tags?.length ? tags : ['standard'];
  return Object.keys(JOBS_PROFILE_SECTIONS).filter(section => keys.every(key => definitions.find(tag => tag.key === key)?.jobs_profile_permissions?.includes(section)));
}
const text = (value, max = 300) => {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw new Error(`Enter text up to ${max} characters.`);
  return value.replace(/\r/g, '').trim();
};
const rows = (value, fields, limit = 20) => {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > limit) throw new Error(`Add up to ${limit} entries.`);
  return value.map(row => Object.fromEntries(Object.entries(fields).map(([key, max]) => [key, text(row?.[key], max)])));
};
export function normalizeJobsProfileSection(key, input = {}) {
  if (!Object.hasOwn(JOBS_PROFILE_SECTIONS, key)) throw new Error('Choose a valid profile section.');
  const audience = input.audience ?? 'private';
  if (!Object.hasOwn(JOBS_PROFILE_AUDIENCES, audience) || key === 'nation' && audience === 'public') throw new Error('Nation-growth ideas may be Private or Applied jobs only. Choose a valid audience.');
  const value = input.value || {};
  if (key === 'basics') {
    const name = text(value.name, 120);
    if (!name) throw new Error('Enter your name.');
    const email = text(value.email, 160);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid contact email.');
    return { audience, value: { name, email, phone: text(value.phone, 40), location: text(value.location, 160), headline: text(value.headline, 160), summary: text(value.summary, 3000), education: rows(value.education, { qualification: 160, institution: 160, year: 40 }), certificates: rows(value.certificates, { title: 160, issuer: 160, year: 40 }), languages: rows(value.languages, { name: 80, proficiency: 80 }) } };
  }
  if (key === 'experience') return { audience, value: { current: rows(value.current, { employer: 160, role: 160, from: 40, description: 3000 }), previous: rows(value.previous, { employer: 160, role: 160, from: 40, to: 40, description: 3000 }) } };
  const fields = {
    mindset: ['natural', 'positive', 'mindset'], direction: ['focus', 'development'],
    business: ['thoughts'], interests: ['industry', 'domain', 'scope'],
    nation: ['idea', 'resources', 'viability'], hustles: ['story', 'notes'], inspiration: ['inspiring', 'lessons', 'not_inspiring'],
  }[key];
  if (key === 'direction' && value.focus && !['Job', 'Family Business', 'Enterprise Development'].includes(value.focus)) throw new Error('Choose Job, Family Business or Enterprise Development.');
  return { audience, value: Object.fromEntries(fields.map(field => [field, text(value[field], 6000)])) };
}
export function normalizeJobsHome(input = {}) {
  const accent = input.accent || '#166534';
  if (!/^#[0-9a-f]{6}$/i.test(accent)) throw new Error('Choose a valid accent colour.');
  if (input.theme && !['light', 'dark'].includes(input.theme)) throw new Error('Choose a light or dark Home page.');
  const photo = text(input.photo, 1000);
  if (photo) { let url; try { url = new URL(photo); } catch { throw new Error('Use an HTTPS photo URL.'); } if (url.protocol !== 'https:') throw new Error('Use an HTTPS photo URL.'); }
  return { title: text(input.title, 160), introduction: text(input.introduction, 3000), photo, accent, theme: input.theme || 'light' };
}
export function visibleJobsProfile(document, audience, enabled = Object.keys(JOBS_PROFILE_SECTIONS)) {
  const sections = {};
  for (const [key, section] of Object.entries(document?.sections || {})) {
    if (!Object.hasOwn(JOBS_PROFILE_SECTIONS, key) || !enabled.includes(key)) continue;
    if (audience === 'public' && (section.audience !== 'public' || key === 'nation')) continue;
    if (audience === 'applied_jobs' && !['public', 'applied_jobs'].includes(section.audience)) continue;
    sections[key] = section;
  }
  return { profileType: JOBS_PROFILE_TYPE, home: document?.home || normalizeJobsHome(), sections };
}
