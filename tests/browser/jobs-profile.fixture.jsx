import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import App from '../../src/App.jsx';
import '../../src/styles.css';
import { ALL_PERMISSIONS } from '../../shared/rbac.js';
import { JOBS_PROFILE_SECTIONS, isJobsProfileAccount, normalizeJobsProfileSection, normalizeJobsHome, visibleJobsProfile } from '../../shared/jobsProfile.js';
const params = new URLSearchParams(location.search), owner = params.get('role') === 'owner';
const keys = Object.keys(JOBS_PROFILE_SECTIONS);
const tags = [{ key: 'standard', label: 'Standard', visibility: 'public', permissions: [...ALL_PERMISSIONS], platform_permissions: [], jobs_profile_permissions: [...keys] }, { key: 'hero', label: 'Hero', visibility: 'public', permissions: [...ALL_PERMISSIONS], platform_permissions: [], jobs_profile_permissions: [...keys] }];
const state = window.jobsProfileFixture = {
  failSave: false, reads: [], writes: [], tags,
  user: { id: 'candidate', name: 'Asha Kumar', email: 'asha@example.test', slug: 'asha', profileType: 'individual', permissions: ['job_seeker'], tags: ['standard'], jobsProfilePermissions: [...keys], platformPermissions: [], isSuperAdmin: owner, isAdmin: !owner },
  accounts: [
    { id: 'ordinary', name: 'Regular profile', email: 'regular@example.test', slug: 'regular', profileType: 'individual', tags: ['standard'], platformPermissions: [], approval_status: 'approved' },
    { id: 'candidate', name: 'Asha Kumar', email: 'asha@example.test', slug: 'asha', profileType: 'individual', jobSeeker: true, tags: ['hero'], platformPermissions: [], approval_status: 'approved', hasDetails: true },
    { id: 'pending', name: 'Pending candidate', email: 'pending@example.test', slug: 'pending', profileType: 'jobs', tags: ['standard'], platformPermissions: ['profiles.create'], approval_status: 'pending', hasDetails: false },
  ],
  document: { version: 1, published: true, home: normalizeJobsHome({ title: 'Asha Kumar', introduction: 'Building useful tools and looking for new opportunities.' }), sections: {
    basics: { audience: 'public', value: { name: 'Asha Kumar', headline: 'Software engineer', email: 'contact@example.test', location: 'New Delhi', education: [{ qualification: 'B.Tech', institution: 'Example University', year: '2023' }], languages: [{ name: 'Hindi', proficiency: 'Native' }] } },
    experience: { audience: 'public', value: { current: [{ employer: 'Example Studio', role: 'Engineer', from: '2023', description: 'Build accessible tools.' }], previous: [] } },
    mindset: { audience: 'applied_jobs', value: { mindset: 'An answer for applied jobs only.' } },
    nation: { audience: 'private', value: { idea: 'A private nation-growth idea.' } },
  } },
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const editor = () => ({ ...visibleJobsProfile(state.document, 'owner', state.user.jobsProfilePermissions), enabledSections: state.user.jobsProfilePermissions, version: state.document.version, published: state.document.published });
window.fetch = async (url, options = {}) => {
  if (String(url).startsWith('/api/profile')) return json({ ...visibleJobsProfile(state.document, 'public', state.user.jobsProfilePermissions), slug: 'asha', name: 'Asha Kumar' });
  if (String(url).startsWith('/api/site')) return json({ profileType: 'jobs', offers: [] });
  if (url === '/api/track') return json({ ok: true });
  if (url !== '/api/admin') return json({ error: `Unexpected request: ${url}` }, 400);
  const { op, args = {} } = JSON.parse(options.body || '{}'); state.reads.push(op);
  if (op === 'auth.me') return json({ user: state.user });
  if (op === 'auth.logout') { state.user = null; return json({ ok: true }); }
  if (op === 'jobsProfile.get') return json(editor());
  if (op === 'jobsProfile.save') {
    state.writes.push(args);
    if (state.failSave) return json({ error: 'Your profile changed in another editor. Reload the saved profile before saving.' }, 409);
    try {
      if (args.version !== state.document.version) return json({ error: 'Profile changed.' }, 409);
      if (args.section === 'home') { state.document.home = normalizeJobsHome(args.value); state.document.published = args.published; }
      else state.document.sections[args.section] = normalizeJobsProfileSection(args.section, args);
      state.document.version++; return json(editor());
    } catch (error) { return json({ error: error.message }, 400); }
  }
  if (op === 'platform.master.get') return json({ tags });
  if (op === 'users.list') return json({ users: state.accounts.filter(account => !isJobsProfileAccount(account, tags)), tags });
  if (op === 'platform.jobsProfile.list') return json({ profiles: state.accounts.filter(account => isJobsProfileAccount(account, tags) && (owner || account.approval_status === 'approved')), tags });
  if (op === 'users.update') {
    if (!owner) return json({ error: 'Profile editing access is required.' }, 403);
    const account = state.accounts.find(account => account.id === args.id);
    if (!account) return json({ error: 'Profile unavailable.' }, 404);
    Object.assign(account, args); state.writes.push(args); return json({ ok: true });
  }
  if (op === 'platform.jobsProfile.get') return args.id === 'candidate' ? json(visibleJobsProfile(state.document, 'owner', keys)) : json({ error: 'Profile details are not available.' }, 404);
  if (op === 'platform.profiles.approve') {
    if (!owner) return json({ error: 'Only Superadmin can approve profiles.' }, 403);
    const account = state.accounts.find(account => account.id === args.id && account.approval_status === 'pending');
    if (!account || !['approve', 'reject'].includes(args.action)) return json({ error: 'This profile is no longer pending.' }, 409);
    account.approval_status = args.action === 'approve' ? 'approved' : 'rejected'; state.writes.push(args); return json(account);
  }
  if (op === 'platform.tags.update') { const tag = tags.find(tag => tag.key === args.key); Object.assign(tag, { permissions: args.permissions, visibility: args.visibility, jobs_profile_permissions: args.jobsProfilePermissions, platform_permissions: args.platformPermissions || [] }); state.writes.push(args); return json({ tag }); }
  return json({ error: `Unexpected operation: ${op}` }, 400);
};
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[params.get('view') || (owner ? '/superadmin/master' : '/admin/home')]}><App /></MemoryRouter>);
