import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePage } from '../shared/pageSettings.js';
import { normalizePortfolio } from '../shared/portfolio.js';
import { resolveSite } from '../src/lib/portfolioModel.js';
import { savePage, saveSettings } from '../server/site.js';
import { scriptedDatabase, step } from './support/database.js';

test('saved Classic settings resolve to the single portfolio while retaining customization', () => {
  const page = normalizePage({ template: 'classic', accent: 'emerald', hero: { x: 37, y: 62, zoom: 1.75 }, chat: { mic: false }, theme: { bg: 'image', font: 'serif' } });
  assert.equal(page.template, 'portfolio');
  assert.equal(page.accent, 'emerald');
  assert.equal(page.hero.zoom, 1.75);
  assert.equal(page.chat.mic, false);
  assert.equal(page.theme.bg, 'image');
});

test('every portfolio has an internal Chat page and its AI buttons use that page', () => {
  const model = resolveSite({ name: 'Ravi Yadav', portfolio: { enquiry: { enabled: false } } }, 'ravi');
  assert.ok(model.pages.some(page => page.key === 'chat' && page.path === '/p/ravi'));
  assert.equal(model.intro.url, '/p/ravi');
  assert.equal(model.cta.url, '/p/ravi');
  assert.equal(normalizePortfolio({ navLabels: { chat: 'Ask Ravi' } }).navLabels.chat, 'Ask Ravi');
});

test('portfolio visibility switches carry over from Look and Store', () => {
  const model = resolveSite({ name: 'Ravi', expertise: ['Design'], education: [{ qualification: 'B.Tech' }], experience: { employers: [{ company: 'Studio' }] }, portfolio: { products: [{ title: 'Guide' }], experience: [{ company: 'Studio' }] }, page: { sections: { store: false, expertise: false, education: false, experience: false } } }, 'ravi');
  assert.equal(model.products.length, 0);
  assert.equal(model.domains.length, 0);
  assert.equal(model.skills.length, 0);
  assert.equal(model.education.length, 0);
  assert.equal(model.experience.length, 0);
  assert.ok(!model.pages.some(page => ['products', 'experience'].includes(page.key)));
  assert.ok(model.pages.some(page => page.key === 'chat'));
});

test('legacy profile copy and shop headings are carried into the portfolio', () => {
  const model = resolveSite({ name: 'Ravi', page: { tagline: 'Designer', about: 'My custom story', storeTitle: 'My downloads', storeSubtitle: 'Made for creators' } }, 'ravi');
  assert.equal(model.titleLine, 'Designer');
  assert.equal(model.aboutBody, 'My custom story');
  assert.equal(model.productsTitle, 'My downloads');
  assert.equal(model.productsSubtitle, 'Made for creators');
});

test('one portfolio save persists persona background, page and portfolio together', async () => {
  const saved = { id: 4, bg: { zoom: 1 }, page: {}, portfolio: {} };
  const db = scriptedDatabase({ table: 'site_settings', data: [saved] }, { table: 'site_settings' }, { table: 'site_settings', data: [saved] });
  db.uid = 'owner';
  await savePage(db, { bg: { zoom: 2.5, brightness: 75 }, page: { accent: 'emerald' }, portfolio: { brand: 'Ravi' } });
  const updates = db.calls.filter(call => step(call, 'update'));
  assert.equal(updates.length, 1);
  const [patch] = step(updates[0], 'update');
  assert.equal(patch.bg.zoom, 2.5);
  assert.equal(patch.bg.brightness, 75);
  assert.equal(patch.page.accent, 'emerald');
  assert.equal(patch.portfolio.brand, 'Ravi');
});

test('a cross-owner background path is rejected before saving any portfolio edits', async () => {
  const db = scriptedDatabase({ table: 'site_settings', data: [{ id: 4 }] }, { table: 'site_settings' }, { table: 'site_settings', data: [{ id: 4 }] });
  db.uid = 'owner';
  await assert.rejects(savePage(db, { path: 'other-owner/image.webp', portfolio: { brand: 'Changed' } }), /Bad image path/);
  assert.ok(!db.calls.some(call => step(call, 'update')));
});

test('ordinary page edits preserve background and image settings not sent by the editor', async () => {
  const saved = { id: 4, bg: { zoom: 2 }, bg_path: 'owner/image.webp' };
  const db = scriptedDatabase({ table: 'site_settings', data: [saved] }, { table: 'site_settings' }, { table: 'site_settings', data: [saved] });
  db.uid = 'owner';
  await savePage(db, { portfolio: { brand: 'Ravi' } });
  const [patch] = step(db.calls.find(call => step(call, 'update')), 'update');
  assert.ok(!Object.hasOwn(patch, 'bg'));
  assert.ok(!Object.hasOwn(patch, 'bg_path'));
});

test('overview commands open the requested studio tool without performing changes', async () => {
  const { resolveStudioAction, greetingForHour } = await import('../shared/studio.js');
  const cases = [
    ['Create a new template for a conference talk', '/admin/writing?tab=templates'],
    ['Write a post', '/admin/writing'],
    ['Update my persona', '/admin/settings?tab=persona'],
    ['Organize my files', '/admin/files'],
    ['Edit my shop', '/admin/store'],
    ['Add a project', '/admin/activity?tab=projects'],
    ['See my purchases', '/admin/purchases'],
  ];
  for (const [query, target] of cases) assert.equal(resolveStudioAction(query)?.to, target, query);
  assert.equal(resolveStudioAction(''), null);
  assert.equal(resolveStudioAction('execute https://outside.example'), null);
  assert.equal(greetingForHour(9), 'Good morning');
  assert.equal(greetingForHour(14), 'Good afternoon');
  assert.equal(greetingForHour(22), 'Good evening');
});

function pageDatabase(current, update = {}) {
  const db = scriptedDatabase({ table: 'site_settings', data: [current] }, { table: 'site_settings', ...update }, { table: 'site_settings', data: [{ ...current, bg: { zoom: 2 } }] });
  db.uid = 'owner';
  return db;
}

test('both uploaded images are checked exactly and their replacements save in one update', async () => {
  const db = pageDatabase({ id: 4, hero_path: 'owner/old-hero.webp', bg_path: 'owner/old-bg.webp' });
  const uploaded = [], removed = [];
  const storage = { list: async (owner, options) => { uploaded.push([owner, options.search]); return { data: [{ name: options.search }] }; }, remove: async paths => { removed.push(...paths); return {}; } };
  await savePage(db, { heroPath: 'owner/new-hero.webp', path: 'owner/new-bg.webp', bg: { zoom: 2 }, page: { accent: 'emerald' } }, storage);
  const [patch] = step(db.calls.find(call => step(call, 'update')), 'update');
  assert.equal(patch.hero_path, 'owner/new-hero.webp');
  assert.equal(patch.bg_path, 'owner/new-bg.webp');
  assert.deepEqual(uploaded, [['owner', 'new-hero.webp'], ['owner', 'new-bg.webp']]);
  assert.deepEqual(removed.sort(), ['owner/old-bg.webp', 'owner/old-hero.webp']);
});

test('an image used by another retained setting is never removed', async () => {
  const db = pageDatabase({ id: 4, hero_path: 'owner/shared.webp', bg_path: 'owner/shared.webp' });
  const removed = [];
  await savePage(db, { path: null }, { remove: async paths => { removed.push(...paths); return {}; } });
  assert.deepEqual(removed, []);
});

test('missing uploads and failed writes preserve the existing images', async () => {
  for (const missing of [{ data: [{ name: 'different.webp' }] }, { data: [], error: { message: 'Storage secret' } }]) {
    const db = pageDatabase({ id: 4, bg_path: 'owner/old-bg.webp' });
    await assert.rejects(savePage(db, { path: 'owner/new-bg.webp' }, { list: async () => missing }), /upload was not found/);
    assert.ok(!db.calls.some(call => step(call, 'update')));
  }
  const db = pageDatabase({ id: 4, bg_path: 'owner/old-bg.webp' }, { error: { message: 'write failed' } });
  let removed = false;
  await assert.rejects(savePage(db, { path: null }, { remove: async () => { removed = true; } }), /write failed/);
  assert.equal(removed, false);
});

test('legacy background saves also preserve images on failed writes or while retained as the portrait', async () => {
  const failed = pageDatabase({ id: 4, bg_path: 'owner/old-bg.webp' }, { error: { message: 'write failed' } });
  let removed = false;
  await assert.rejects(saveSettings(failed, { path: null }, { remove: async () => { removed = true; } }), /write failed/);
  assert.equal(removed, false);
  const shared = pageDatabase({ id: 4, bg_path: 'owner/shared.webp', hero_path: 'owner/shared.webp' });
  await saveSettings(shared, { path: null }, { remove: async () => { removed = true; } });
  assert.equal(removed, false);
});

test('failed cleanup reports a saved-setting warning rather than silently hiding the failure', async () => {
  for (const remove of [async () => ({ error: { message: 'private storage details' } }), async () => { throw new Error('private storage details'); }]) {
    const db = pageDatabase({ id: 4, bg_path: 'owner/old-bg.webp' });
    const result = await savePage(db, { path: null, bg: { zoom: 2 } }, { remove });
    assert.match(result.warning, /saved.*older image/i);
    assert.ok(!result.warning.includes('private'));
    assert.ok(db.calls.some(call => step(call, 'update')));
  }
});

test('hiding experience removes its automatically derived statistics too', () => {
  const model = resolveSite({ name: 'Ravi', experience: { total_years: 8 }, page: { sections: { experience: false } } }, 'ravi');
  assert.ok(!model.stats.some(item => /experience/i.test(item.label)));
});
