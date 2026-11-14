import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import App from '../../src/App.jsx';
import { normalizePage } from '../../shared/pageSettings.js';
import { normalizePortfolio } from '../../shared/portfolio.js';
import { normalizeBg } from '../../shared/siteSettings.js';
import { VISIBILITY_DEFAULTS } from '../../shared/profileSchema.js';
import '../../src/styles.css';

// Exercise the real Settings route, navigation and saves with isolated local data.
const storageKey = 'fixture:public-page-settings';
const state = JSON.parse(sessionStorage.getItem(storageKey) || 'null') || {
  site: { page: normalizePage({ glass: { on: false } }), portfolio: normalizePortfolio({ bio: 'Fixture introduction' }), bg: normalizeBg(), heroUrl: null, imageUrl: null },
  profile: { name: 'Fixture Owner', purpose: 'Sharing design tools and knowledge.', status: 'published', visibility: structuredClone(VISIBILITY_DEFAULTS), education: [], contact: {}, expertise: ['Design'] },
  paymentEnabled: true,
};
const persist = () => sessionStorage.setItem(storageKey, JSON.stringify(state));
let user = JSON.parse(sessionStorage.getItem('fixture:account') || 'null') || { id: 'fixture-owner', name: 'Fixture Owner', email: 'owner@example.test', slug: 'fixture-owner', isAdmin: true };
window.__settingsCalls = [];
window.fetch = async (url, options) => {
  if (url === '/api/track') return Response.json({ ok: true });
  if (url !== '/api/admin') throw new Error(`Unexpected fixture request: ${url}`);
  const { op, args } = JSON.parse(options.body);
  window.__settingsCalls.push({ op, args });
  switch (op) {
    case 'auth.me': return Response.json({ user });
    case 'auth.logout': user = null; return Response.json({ ok: true });
    case 'account.change': {
      if (args.currentPassword !== 'fixture-current-password') return Response.json({ error: 'Current password is incorrect.' }, { status: 403 });
      if (args.kind === 'password') { user = null; sessionStorage.removeItem('fixture:account'); return Response.json({ passwordChanged: true }); }
      if (user.userIdNextChangeAt && Date.parse(user.userIdNextChangeAt) > Date.now()) return Response.json({ error: 'You can change your user ID again in 14 days.' }, { status: 409 });
      user = { ...user, slug: args.userId, userIdNextChangeAt: new Date(Date.now() + 14 * 86400000).toISOString() };
      sessionStorage.setItem('fixture:account', JSON.stringify(user)); return Response.json({ user });
    }
    case 'site.get': return Response.json(state.site);
    case 'profile.get': return Response.json({ profile: state.profile, contributions: [] });
    case 'enquiries.count': return Response.json({ new: 0 });
    case 'page.preview': return Response.json({ ...state.profile, page: state.site.page, portfolio: state.site.portfolio, contributions: [] });
    case 'page.save':
      if (args.page) state.site.page = normalizePage(args.page);
      if (args.portfolioPatch) state.site.portfolio = normalizePortfolio({ ...state.site.portfolio, ...args.portfolioPatch });
      if (args.portfolio) state.site.portfolio = normalizePortfolio(args.portfolio);
      if (args.bg) state.site.bg = normalizeBg(args.bg);
      persist(); return Response.json(state.site);
    case 'profile.visibility': state.profile.visibility = args.visibility; persist(); return Response.json({ ok: true });
    case 'payments.settings': return Response.json({ configured: true, webhookConfigured: true, testMode: true, enabled: state.paymentEnabled });
    case 'payments.saveSettings': state.paymentEnabled = args.enabled; persist(); return Response.json({ ok: true });
    default: throw new Error(`Unexpected fixture operation: ${op}`);
  }
};
const params = new URLSearchParams(location.search);
const initial = params.get('legacy') === 'portfolio' ? '/admin/portfolio?tab=projects&focus=edit'
  : params.get('legacy') === 'privacy' ? '/admin/profile?tab=visibility'
  : params.get('legacy') === 'payments' ? '/admin/purchases?tab=settings'
  : params.get('legacy') === 'contact' ? '/admin/enquiries?tab=form'
  : params.get('legacy') === 'look' ? '/admin/page'
  : params.get('tab') === 'account' ? '/admin/settings?tab=account' : '/admin/settings';
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[initial]}><App /></MemoryRouter>);
