import test from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOMIZATION_FIELDS, CUSTOMIZATION_DEFAULTS, normalizeCustomization, customizationProblem, customizePageStyle, applyStylePreset } from '../shared/customization.js';
import { normalizePage } from '../shared/pageSettings.js';
import { normalizePortfolio } from '../shared/portfolio.js';
import { normalizeBg } from '../shared/siteSettings.js';
import { makeStudioPlan, studioRecords, studioModelContext } from '../server/studioPlan.js';
import { STUDIO_ENTITIES } from '../shared/studioAssistant.js';
import { resolveSite } from '../src/lib/portfolioModel.js';
import { activityDisplayModel, sortDisplayItems } from '../src/lib/customizationDisplay.js';
import { savePage } from '../server/site.js';
import { rebaseEditorDraft, editorDraftChanged } from '../src/lib/editorDrafts.js';
import { resolveHomeAwards } from '../shared/customizationReferences.js';
import { scriptedDatabase, step, hasEq } from './support/database.js';

test('customization defaults are safe and every control is accepted by its shared validator', () => {
  assert.equal(customizationProblem(CUSTOMIZATION_DEFAULTS), '');
  assert.deepEqual(normalizePage().customization, CUSTOMIZATION_DEFAULTS);
  for (const [key, field] of Object.entries(CUSTOMIZATION_FIELDS)) assert.equal(customizationProblem({ [key]: field.default }), '', key);
  const value = normalizeCustomization({ storeLayout: 'list', storeColumns: 99, navOrder: ['contact'], activitySections: ['events'], activityDefault: 'projects' });
  assert.equal(value.storeLayout, 'list'); assert.equal(value.storeColumns, 3);
  assert.equal(value.navOrder.length, 5); assert.equal(value.activityDefault, 'events');
});
test('unsafe and unknown assistant customization values are rejected', () => {
  for (const patch of [{ toString: 'x' }, { arbitraryCss: 'x' }, { storePrices: 'false' }, { storeLayout: 'unknown' }, { homeAccent: 'red' }, { navOrder: ['home', 'home'] }, { activitySections: [] }, { homeFeaturedItems: ['product:a', 'product:a'] }]) assert.ok(customizationProblem(patch));
});

const snapshot = () => ({ settings: { version: 'v1', page: normalizePage(), bg: normalizeBg(), portfolio: normalizePortfolio({ products: [{ id: 'book', title: 'Book' }], awards: [{ title: 'Prize' }], recognition: [{ kind: 'award', title: 'Medal' }] }) }, offerings: [{ id: 20, title: 'Session' }] });
const actor = { id: 'owner' };
test('every declarative editor option is readable, plannable and included in the approved save', () => {
  assert.deepEqual(STUDIO_ENTITIES.customization.fields, Object.keys(CUSTOMIZATION_FIELDS));
  for (const [key, field] of Object.entries(CUSTOMIZATION_FIELDS)) {
    const value = field.type === 'boolean' ? !field.default : field.type === 'select' ? field.options.find(option => option !== field.default) : field.type === 'number' ? field.default === field.max ? field.min : field.max : field.type === 'list' ? field.ordered ? [...field.default].reverse() : field.default.length ? [] : [field.options[0]] : field.type === 'references' ? [key === 'homeAwards' ? 'recognition:legacy-recognition-0' : 'offering:20'] : field.type === 'colour' ? '#123456' : 'My custom text';
    const chosen = key === 'activitySections' ? ['events'] : value;
    const input = snapshot();
    const plan = makeStudioPlan({ actions: [{ entity: 'customization', action: 'update', values: { [key]: chosen } }] }, input, actor);
    assert.equal(plan.steps.length, 1, key);
    assert.equal(plan.steps[0].op, 'page.save', key);
    assert.equal(plan.steps[0].args.expectedVersion, 'v1');
    assert.deepEqual(plan.steps[0].args.page.customization[key], chosen, key);
    assert.deepEqual(studioRecords({ settings: { ...input.settings, page: plan.steps[0].args.page } }, 'customization')[0][key], chosen, key);
    assert.deepEqual(input.settings.page.customization, CUSTOMIZATION_DEFAULTS, 'Planning never mutates saved state');
  }
});
test('assistant references only existing owned Store items and awards', () => {
  const input = snapshot(), context = studioModelContext(input, ['customization'], actor).customization;
  assert.deepEqual(context.references.store.map(row => row.id), ['product:book', 'offering:20']);
  assert.deepEqual(context.references.awards.map(row => row.id), ['highlight:legacy-award-0', 'recognition:legacy-recognition-0']);
  for (const values of [{ homeFeaturedItems: ['offering:other-owner'] }, { homeAwards: ['recognition:99'] }, { arbitraryCss: 'alert(1)' }]) assert.throws(() => makeStudioPlan({ actions: [{ entity: 'customization', action: 'update', values }] }, input, actor));
  const plan = makeStudioPlan({ actions: [{ entity: 'portrait', action: 'update', values: { imageUrl: 'https://example.test/me.png' } }, { entity: 'background', action: 'update', values: { imageUrl: 'https://example.test/background.png' } }] }, input, actor);
  assert.equal(plan.steps[0].args.page.hero.imageUrl, 'https://example.test/me.png');
  assert.equal(plan.steps[0].args.bg.imageUrl, 'https://example.test/background.png');
  assert.throws(() => makeStudioPlan({ actions: [{ entity: 'portrait', action: 'update', values: { imageUrl: 'javascript:alert(1)' } }] }, input, actor));
});
test('Home selections and reordered navigation use saved identities without altering checkout records', () => {
  const data = { name: 'Owner', page: { customization: { homeFeaturedItems: ['product:b'], navOrder: ['store', 'home', 'activity', 'contact', 'chat'] } }, portfolio: { products: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B', pricing: 'free' }] } };
  const model = resolveSite(data, 'owner');
  assert.equal(model.pages[0].key, 'store'); assert.deepEqual(model.homeProducts.map(row => row.id), ['b']);
  assert.equal(model.products.length, 2); assert.deepEqual(model.homeProducts[0].checkout, { kind: 'product', id: 'b' });
  assert.equal(resolveSite({ ...data, page: { sections: { store: false }, customization: data.page.customization } }, 'owner').homeProducts.length, 0);
});
test('display sorting and Activity limits preserve complete saved content and event timing', () => {
  const model = { projects: [{ title: 'Z', year: '2020', summary: 'Old' }, { title: 'A', year: '2025', summary: 'New' }], events: [{ title: 'Event', startsAt: '2026-12-10T10:00:00Z', body: 'Event description', rsvp: { enabled: true } }] };
  const display = activityDisplayModel(model, normalizeCustomization({ activitySort: 'newest', activityDescriptions: false, activityDates: false }), 1);
  assert.equal(display.projects[0].title, 'A'); assert.equal(display.projects[0].summary, ''); assert.equal(display.projects[0].year, '');
  assert.equal(display.events[0].startsAt, model.events[0].startsAt); assert.equal(display.events[0].rsvp.enabled, true);
  assert.equal(model.projects.length, 2); assert.equal(model.projects[1].summary, 'New');
  assert.deepEqual(sortDisplayItems([{ title: 'B', amount: 10 }, { title: 'A', amount: 4 }], 'price_low').map(row => row.title), ['A', 'B']);
});
test('scoped content saves preserve unrelated settings and reject stale or racing writes', async () => {
  const current = { id: 1, updated_at: 'v1', page: { customization: { storeLayout: 'list' } }, portfolio: { brand: 'Keep', products: [{ id: 'book', title: 'Book' }], talks: [{ title: 'Keep talk' }] } };
  const db = scriptedDatabase({ table: 'site_settings', data: [current] }, { table: 'site_settings', data: [{ id: 1 }] }, { table: 'site_settings', data: [current] }); db.uid = 'owner';
  await savePage(db, { portfolioPatch: { products: [{ id: 'book', title: 'Updated' }] }, expectedVersion: 'v1' });
  const call = db.calls.find(call => step(call, 'update')), patch = step(call, 'update')[0];
  assert.equal(patch.portfolio.products[0].id, 'book'); assert.equal(patch.portfolio.brand, 'Keep'); assert.equal(patch.portfolio.talks[0].title, 'Keep talk'); assert.equal(patch.page, undefined);
  assert.ok(hasEq(call, 'updated_at', 'v1'));
  const stale = scriptedDatabase({ table: 'site_settings', data: [current] }); stale.uid = 'owner';
  await assert.rejects(savePage(stale, { page: {}, expectedVersion: 'v0' }), /settings changed/); assert.equal(stale.calls.length, 1);
  const raced = scriptedDatabase({ table: 'site_settings', data: [current] }, { table: 'site_settings', data: [] }); raced.uid = 'owner';
  await assert.rejects(savePage(raced, { page: {}, expectedVersion: 'v1' }), /settings changed/);
});
test('featured awards keep their identity after reordering and deletion', () => {
  const p = normalizePortfolio({ awards: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], recognition: [{ id: 'r1', title: 'Award 1', kind: 'award' }, { id: 'r2', title: 'Award 2', kind: 'award' }] });
  assert.deepEqual(resolveHomeAwards({ ...p, awards: [...p.awards].reverse() }, ['highlight:a']).map(row => row.title), ['A']);
  assert.deepEqual(resolveHomeAwards({ ...p, awards: [p.awards[1]] }, ['highlight:a']), []);
  assert.deepEqual(resolveHomeAwards({ ...p, recognition: [...p.recognition].reverse() }, ['recognition:r1']).map(row => row.title), ['Award 1']);
});
test('legacy product migration updates Home selections atomically', async () => {
  const current = { id: 1, updated_at: 'v1', portfolio: { products: [{ title: 'Legacy' }] }, page: { customization: { homeFeaturedItems: ['product:legacy-0'] } } };
  const db = scriptedDatabase({ table: 'site_settings', data: [current] }, { table: 'site_settings', data: [{ id: 1 }] }, { table: 'site_settings', data: [current] }); db.uid = 'owner';
  await savePage(db, { portfolioPatch: { brand: 'Updated' }, expectedVersion: 'v1' });
  const patch = step(db.calls.find(call => step(call, 'update')), 'update')[0];
  assert.deepEqual(patch.page.customization.homeFeaturedItems, [`product:${patch.portfolio.products[0].id}`]);
  assert.equal(resolveSite({ page: patch.page, portfolio: patch.portfolio }, 'owner').homeProducts.length, 1);
});
test('Activity preserves its featured badge and Events uses a total category limit', () => {
  const model = resolveSite({ portfolio: { projects: [{ title: 'A' }, { title: 'Z', featured: true }] }, events: [{ title: 'E' }], updates: [{ title: 'U' }], schedule: [{ title: 'S' }] }, 'owner');
  const display = activityDisplayModel(model, normalizeCustomization({ activitySort: 'title' }), 2);
  assert.equal(display.featured.title, 'Z'); assert.equal(display.featured, display.projects.find(row => row.title === 'Z'));
  assert.equal(display.events.length + display.updates.length + display.schedule.length, 2);
});
test('editor handoffs retain image state and only reapply edited fields to latest content', () => {
  const saved = { version: 'v1', page: normalizePage(), portfolio: normalizePortfolio({ products: [{ id: 'a', title: 'Old' }] }), bg: normalizeBg() };
  const pending = { url: 'blob:test', blob: new Blob(['image']) };
  const draft = { saved, page: { ...saved.page, headline: 'My draft' }, pf: saved.portfolio, bg: saved.bg, pending, removedBg: true };
  const latest = { ...saved, version: 'v2', portfolio: normalizePortfolio({ products: [{ id: 'a', title: 'New content' }] }) };
  const restored = rebaseEditorDraft(draft, latest);
  assert.deepEqual(restored.conflicts, []); assert.equal(restored.saved.version, 'v2'); assert.equal(restored.pf.products[0].title, 'New content'); assert.equal(restored.page.headline, 'My draft'); assert.equal(restored.pending, pending); assert.equal(restored.removedBg, true);
  const conflict = rebaseEditorDraft(draft, { ...latest, page: { ...latest.page, headline: 'Another edit' } });
  assert.deepEqual(conflict.conflicts, ['page.headline']); assert.equal(conflict.saved.version, 'v1');
  assert.equal(editorDraftChanged({ saved, page: saved.page, pf: saved.portfolio, bg: saved.bg }), false);
  assert.equal(editorDraftChanged({ saved, page: saved.page, pf: saved.portfolio, bg: saved.bg, removed: true }), true);
});
test('restored image drafts cannot overwrite a concurrent uploaded image replacement', () => {
  const saved = { version: 'v1', page: normalizePage(), portfolio: normalizePortfolio(), bg: normalizeBg(), uploadedHeroUrl: 'old-hero', uploadedImageUrl: 'old-background' };
  const base = { saved, page: saved.page, pf: saved.portfolio, bg: saved.bg };
  for (const [flag, field, label] of [['pending', 'uploadedHeroUrl', 'portrait image'], ['removed', 'uploadedHeroUrl', 'portrait image'], ['pendingBg', 'uploadedImageUrl', 'background image'], ['removedBg', 'uploadedImageUrl', 'background image']]) {
    const restored = rebaseEditorDraft({ ...base, [flag]: true }, { ...saved, version: 'v2', [field]: 'new-image' });
    assert.deepEqual(restored.conflicts, [label]); assert.equal(restored.saved.version, 'v1');
  }
});
test('page overrides inherit site settings and presets leave content selections intact', () => {
  const page = normalizePage({ accentHex: '#123456', theme: { font: 'serif' }, customization: { scheme: 'dark', storeScheme: 'light', storeFont: 'mono', homeFeaturedItems: ['product:abc'] } });
  assert.equal(customizePageStyle(page, 'store').scheme, 'light'); assert.equal(customizePageStyle(page, 'store').theme.font, 'mono');
  assert.equal(customizePageStyle(page, 'home').accentHex, '#123456');
  const editorial = applyStylePreset(page.customization, 'editorial');
  assert.equal(editorial.storeLayout, 'list'); assert.deepEqual(editorial.homeFeaturedItems, ['product:abc']);
});
