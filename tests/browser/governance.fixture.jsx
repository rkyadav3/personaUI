import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import App from '../../src/App.jsx';
import { normalizeHomeSettings } from '../../shared/homeSettings.js';
import { canViewProfile } from '../../shared/governance.js';
import '../../src/styles.css';

// Local-only data exercises the real routes, authentication provider and UI. No requests reach live services.
const params = new URLSearchParams(location.search);
const users = [
  { id: 'owner', name: 'Ravi', email: 'ravi@example.test', slug: 'ravi', isAdmin: false, isSuperAdmin: true, role: 'superadmin', tags: [], created_at: '2026-11-01', isLocked: false },
  { id: 'maya', name: 'Maya Patel', email: 'maya@example.test', slug: 'maya', isAdmin: true, isSuperAdmin: false, tags: ['special'], created_at: '2026-11-02', isLocked: false },
  { id: 'dev', name: 'Dev Kumar', email: 'dev@example.test', slug: 'dev', isAdmin: true, isSuperAdmin: false, tags: ['hero'], created_at: '2026-11-03', isLocked: false },
  { id: 'ananya', name: 'Ananya Rao', email: 'ananya@example.test', slug: 'ananya', isAdmin: true, isSuperAdmin: false, tags: ['private'], created_at: '2026-11-04', isLocked: false },
];
let current = params.get('role') === 'visitor' ? null : params.get('role') === 'member' ? users[1] : users[0];
const codes = [{ id: 1, code: 'ABCD2345', label: 'Community invite', max_uses: 5, uses: 1, created_by: 'maya', creator_name: 'Maya Patel', creator_email: 'maya@example.test', created_at: '2026-11-03', expires_at: null, revoked: false }];
const redemptions = [{ id: 1, created_by: 'maya', creator_name: 'Maya Patel', creator_email: 'maya@example.test', invited_name: 'Dev Kumar', invited_email: 'dev@example.test', code: 'ABCD2345', joined_at: '2026-11-03' }];
const suggestions = [{ id: 1, owner_id: 'maya', author_name: 'Maya Patel', author_email: 'maya@example.test', kind: 'add', title: 'Search profiles by tags', body: 'Make it easier to discover Hero and Special profiles.', status: 'new', owner_reply: '', created_at: '2026-11-05' }];
const supportTickets = [{ id: 1, owner_id: 'maya', author_name: 'Maya Patel', author_email: 'maya@example.test', title: 'Payment confirmation', category: 'payments', body: 'My payment confirmation is missing.', status: 'resolved', created_at: '2026-11-13T10:00:00Z', updated_at: '2026-11-13T12:00:00Z' }];
const supportMessages = [{ id: 1, ticket_id: 1, is_superadmin: true, body: 'Your payment has been confirmed.', status: 'resolved', created_at: '2026-11-13T12:00:00Z' }];
const tagDefinitions = [{key:'hero',label:'Hero',visibility:'public'},{key:'special',label:'Special',visibility:'public'},{key:'private',label:'Private profile',visibility:'private'}];
let homeSettings = normalizeHomeSettings();
const sales = { counts: { paidSales: 3, freeOrders: 1, pending: 1, failed: 1, refundedOrders: 1 }, currencies: [{ currency: 'INR', gross: 15000, refunds: 5000, net: 10000, paidSales: 2 }, { currency: 'USD', gross: 1000, refunds: 0, net: 1000, paidSales: 1 }], admins: [{ id: 'maya', name: 'Maya Patel', email: 'maya@example.test', accountExists: true, checkoutEnabled: true, paidSales: 2, freeOrders: 1, earnings: [{ currency: 'INR', gross: 15000, refunds: 5000, net: 10000 }] }, { id: 'dev', name: 'Dev Kumar', email: 'dev@example.test', accountExists: true, checkoutEnabled: true, paidSales: 1, freeOrders: 0, earnings: [{ currency: 'USD', gross: 1000, refunds: 0, net: 1000 }] }], products: [{ ownerId: 'maya', adminName: 'Maya Patel', kind: 'product', itemId: 'book', title: 'Design handbook', currency: 'INR', paidSales: 2, freeOrders: 0, gross: 15000, refunds: 5000, net: 10000 }], recent: [{ id: 'order-1', ownerId: 'maya', adminName: 'Maya Patel', title: 'Design handbook', buyerName: 'Sam', amount: 10000, refundedAmount: 0, currency: 'INR', status: 'paid', paymentId: 'pay_test', createdAt: '2026-11-06' }] };
window.governanceFixture = { failLogout: false, failSupportReply: false, failSupportList: false, delaySupportCreate: false, users, codes, suggestions, supportTickets, supportMessages, sales, get homeSettings() { return homeSettings; }, personalReads: [], resumeCalls: 0, resumeResolvers: [] };
const publicData = account => ({ slug: account.slug, name: account.name, expertise: ['Design', 'Research'], tags: account.tags, portfolio: { projects: [{ title: 'Community workspace', summary: 'Useful tools for communities.' }] } });
window.fetch = async (url, options = {}) => {
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  if (url === '/api/home') return json({ name: homeSettings.siteName || 'Persona', settings: homeSettings, tagDefinitions, mode: 'invite', members: users.filter(account => !account.isSuperAdmin && canViewProfile(account)).map(account => ({ ...publicData(account), views: 20, purpose: 'Building useful tools and sharing what I learn.' })), products: [] });
  if (String(url).startsWith('/api/profile')) { const account = users.find(user => user.slug === new URL(url, location.origin).searchParams.get('slug')); return !account?.isSuperAdmin && canViewProfile(account, current) ? json(publicData(account)) : json({ error: 'Unavailable' }, 404); }
  if (url === '/api/track') return json({ ok: true });
  if (url !== '/api/admin') throw new Error(`Unexpected fixture request: ${url}`);
  const { op, args = {} } = JSON.parse(options.body || '{}');
  if (op === 'auth.me') return json({ user: current });
  if (op === 'auth.logout') { if (window.governanceFixture.failLogout) return json({ error: 'Retry logout' }, 503); current = null; return json({ ok: true }); }
  if (!current) return json({ error: 'Not signed in' }, 401);
  if (op === 'users.list') return json({ users: users.filter(user => !user.isSuperAdmin), tags: tagDefinitions });
  if (op.startsWith('platform.') && !current.isSuperAdmin) return json({ error: 'Owner only' }, 403);
  if (op === 'platform.tags.create') { const tag={key:'custom-'+args.label.toLowerCase().replace(/[^a-z0-9]+/g,'-'),label:args.label,visibility:args.visibility}; tagDefinitions.push(tag); return json({tag}); }
  if (op === 'activity.resume') {
    window.governanceFixture.resumeCalls++;
    if (params.has('delay-activity')) await new Promise(resolve => window.governanceFixture.resumeResolvers.push(resolve));
    return json({hasChanges:true,since:'2026-11-11T00:00:00Z',asOf:'2026-11-12T00:00:00Z',metrics:[{key:'sales',label:'Paid sales',current:5,increase:3,href:'/admin/purchases'},{key:'views',label:'Profile views',current:25,increase:15,href:'/admin'}],revenue:[{currency:'INR',increase:3000,current:5000}]});
  }
  if (op === 'activity.touch') return json({ok:true});
  if (op === 'studio.history') return json({rows:[],nextBefore:null});
  if (op === 'studio.prepare') return json({answer:'You have 5 paid sales. Net earnings are after refunds.',review:null,insights:{metrics:[{label:'Paid sales',value:5},{label:'Profile views',value:25}],revenue:[{currency:'INR',net:5000}],dailySales:[{day:'2026-11-12',sales:3}],asOf:'2026-11-12T00:00:00Z'}});
  if (op === 'platform.sales') return json(sales);
  if (op === 'platform.payments.setEnabled') { sales.admins.find(user => user.id === args.id).checkoutEnabled = args.enabled; return json({ ok: true }); }
  if (op === 'platform.home.get') return json({ settings: homeSettings });
  if (op === 'platform.home.save') { homeSettings = normalizeHomeSettings(args); return json({ settings: homeSettings }); }
  if (['profile.get', 'site.get', 'enquiries.count', 'overview'].includes(op)) { window.governanceFixture.personalReads.push(op); if (current.isSuperAdmin) return json({ error: 'No personal Studio' }, 403); }
  if (op === 'users.update') { Object.assign(users.find(user => user.id === args.id), args, {profile_private:(args.tags || []).some(key=>tagDefinitions.find(tag=>tag.key===key)?.visibility==='private')}); return json({ ok: true }); }
  if (op === 'users.setLock') { users.find(user => user.id === args.id).isLocked = args.locked; return json({ ok: true }); }
  if (op === 'users.resetPassword') return json({ ok: true });
  if (op === 'profile.get') return json({ profile: params.has('no-profile') ? null : { name: current.name, status: 'published', visibility: {} }, contributions: [] });
  if (op === 'site.get') return json({ heroUrl: null, portfolio: {}, page: {} });
  if (op === 'enquiries.count') return json({ new: 0 });
  if (op === 'overview') return json({ counts: { files: 0, posts: 0, topics: 0, chunks: 0, embedded: 0 }, recent: [] });
  if (op === 'invites.list') return json({ codes: codes.filter(code => current.isSuperAdmin || code.created_by === current.id).map(code => ({ ...code, creator: { name: code.creator_name, email: code.creator_email } })), redemptions: redemptions.filter(entry => current.isSuperAdmin || entry.created_by === current.id) });
  if (op === 'invites.create') { const code = 'NEWI2345'; codes.push({ id: codes.length + 1, code, label: args.label, max_uses: +args.maxUses, uses: 0, created_by: current.id, creator_name: current.name, creator_email: current.email, created_at: new Date().toISOString(), revoked: false }); return json({ code }); }
  if (op === 'invites.revoke') { codes.find(code => code.id === args.id).revoked = true; return json({ ok: true }); }
  if (op === 'suggestions.list') return json({ rows: suggestions.filter(row => current.isSuperAdmin || row.owner_id === current.id) });
  if (op === 'suggestions.create') { if (!current.isAdmin || current.isSuperAdmin) return json({ error: 'Admins only' }, 403); suggestions.push({ ...args, id: suggestions.length + 1, owner_id: current.id, author_name: current.name, author_email: current.email, status: 'new', created_at: new Date().toISOString() }); return json({ id: suggestions.length }); }
  if (op === 'suggestions.update') { Object.assign(suggestions.find(row => row.id === args.id), { status: args.status, owner_reply: args.reply, updated_at: new Date().toISOString() }); return json({ ok: true }); }
  if (op === 'support.list') {
    if (window.governanceFixture.failSupportList) return json({ error: 'Support refresh unavailable.' }, 503);
    return json({ rows: supportTickets.filter(ticket => current.isSuperAdmin || ticket.owner_id === current.id) });
  }
  if (op === 'support.create') {
    if (current.isSuperAdmin) return json({ error: 'Admins only' }, 403);
    if (window.governanceFixture.delaySupportCreate) await new Promise(resolve => { window.governanceFixture.finishSupportCreate = resolve; });
    const ticket = { ...args, id: supportTickets.length + 1, owner_id: current.id, author_name: current.name, author_email: current.email, status: 'open', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    supportTickets.push(ticket); return json({ id: ticket.id });
  }
  if (op === 'support.get' || op === 'support.reply') {
    const ticket = supportTickets.find(ticket => ticket.id === +args.id && (current.isSuperAdmin || ticket.owner_id === current.id));
    if (!ticket) return json({ error: 'Support request not found.' }, 404);
    if (op === 'support.get') return json({ ticket, messages: supportMessages.filter(message => message.ticket_id === ticket.id) });
    if (window.governanceFixture.failSupportReply) return json({ error: 'Support temporarily unavailable. Try again.' }, 503);
    if (!current.isSuperAdmin && args.status) return json({ error: 'Owner only' }, 403);
    ticket.status = current.isSuperAdmin ? args.status || ticket.status : ticket.status === 'resolved' ? 'open' : ticket.status;
    ticket.updated_at = new Date().toISOString();
    supportMessages.push({ id: supportMessages.length + 1, ticket_id: ticket.id, author_name: current.name, is_superadmin: current.isSuperAdmin === true, body: args.body || '', status: ticket.status, created_at: ticket.updated_at });
    return json({ ok: true, status: ticket.status });
  }
  return json({ error: `Unexpected operation: ${op}` }, 400);
};
const initial = params.get('view') || (current?.isSuperAdmin ? '/superadmin' : current ? '/admin/invites' : '/');
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[initial]}><App /></MemoryRouter>);
