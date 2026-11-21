// Local UI verification only. All requests are intercepted; no hosted writes or AI calls.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '../../src/App.jsx';
import '../../src/styles.css';
import { normalizeOrganizationDraft } from '../../shared/organization.js';
import { VISIBILITY_DEFAULTS } from '../../shared/profileSchema.js';

const params = new URLSearchParams(location.search);
const user = { id: 'alice', name: 'Administrator', email: 'admin@example.test', slug: 'acme', isAdmin: true, isSuperAdmin: false, workspaceEnabled: true, activeWorkspaceId: 'alice' };
const workspace = { id: 'alice', owner_id: 'alice', name: 'Acme School', slug: 'acme', type: null, status: 'active' };
let profile = null;
const sources = [{ id: 1, kind: 'file', label: 'Admissions policy', status: 'published', audience: 'public', valid_from: null, valid_until: null, revision: 1 }];
window.organizationFixture = { failSave: false, failPolicy: false, requests: [], workspace, sources, get profile() { return profile; } };
const draft = () => normalizeOrganizationDraft({ profile: { name: 'Acme School', organization: { type: 'school', audience: 'Parents and applicants', chatPurpose: 'Explain admissions and school programs', details: { board: 'CBSE', grades: '1–12' } } }, purpose: { description: 'Acme School provides education for families.' } });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
window.fetch = async (url, options = {}) => {
  if (String(url).startsWith('/api/profile')) return json({ name: profile?.name || 'Acme School', profileType: 'organization', organization: profile?.organization, purpose: profile?.purpose, page: {}, portfolio: {} });
  if (url === '/api/track') return json({ ok: true });
  if (url !== '/api/admin') throw new Error(`Unexpected local fixture request: ${url}`);
  const { op, args = {} } = JSON.parse(options.body || '{}'); window.organizationFixture.requests.push(op);
  if (op === 'auth.me') return json({ user });
  if (op === 'profile.get') return json({ profile, contributions: [] });
  if (op === 'site.get') return json({ heroUrl: null });
  if (op === 'enquiries.count') return json({ new: 0 });
  if (op === 'workspace.current') return json({ workspace, role: 'owner', workspaces: [workspace] });
  if (op === 'workspace.setup') { workspace.type = args.type; return json(workspace); }
  if (op === 'profile.extract') return json({ submissionId: 1, draft: draft(), notes: [], clarifications: [], missing: { required: [], optional: ['website', 'contact'] } });
  if (op === 'profile.confirm') { const d = normalizeOrganizationDraft(args.draft); profile = { id: 1, ...d.profile, profile_type: 'organization', purpose: d.purpose.description, visibility: args.visibility || VISIBILITY_DEFAULTS, status: 'published', updated_at: '2026-11-16T00:00:00Z' }; return json({ profile, contributions: [] }); }
  if (op === 'profile.save') { if (window.organizationFixture.failSave) return json({ error: 'Profile save unavailable. Try again.' }, 503); profile = { ...profile, ...args.draft, purpose: args.purpose, updated_at: new Date().toISOString() }; return json({ profile, contributions: [] }); }
  if (op === 'profile.status') { profile.status = args.status; return json({ ok: true }); }
  if (op === 'index.counts') return json({ files: 1, posts: 0, drafts: 0, topics: 0, chunks: 3, embedded: 3, bytes: 100 });
  if (op === 'index.settings') return json({ model: 'local-test', minSimilarity: .6, minKeywordRank: .2 });
  if (op === 'knowledge.sources') return json({ sources });
  if (op === 'knowledge.policy') { if (window.organizationFixture.failPolicy) return json({ error: 'Policy save unavailable.' }, 503); Object.assign(sources[0], { audience: args.audience, valid_from: args.validFrom, valid_until: args.validUntil, revision: sources[0].revision + 1 }); return json(sources[0]); }
  if (op.startsWith('activity.')) return json({ counts: {}, baseline: null, away: false });
  if (op.endsWith('.list') || op.endsWith('.all')) return json([]);
  return json({});
};
history.replaceState({}, '', params.get('view') || '/admin/profile');
createRoot(document.getElementById('root')).render(<BrowserRouter><App /></BrowserRouter>);
