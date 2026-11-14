import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStudioPlan, studioModelContext } from '../server/studioPlan.js';
import { studioCatalog, studioDiff } from '../shared/studioAssistant.js';
import { normalizePortfolio } from '../shared/portfolio.js';
import { normalizePage } from '../shared/pageSettings.js';
import { normalizeBg } from '../shared/siteSettings.js';

const owner = { id: 'owner', isAdmin: true, isSuperAdmin: true };
function snapshot() {
  return {
    settings: { page: normalizePage(), portfolio: normalizePortfolio({ projects: [{ title: 'Project' }], socials: [{ kind: 'github', url: 'https://example.test' }] }), bg: normalizeBg(), heroUrl: 'https://example.test/photo', imageUrl: 'https://example.test/bg' },
    profile: { id: 1, name: 'Ravi', purpose: 'Building tools', contact: {}, education: [], experience: {}, expertise: [], status: 'published' },
    files: [{ id: 2, name: 'note.md', text: 'Keep', folderId: 3, topicId: 4, status: 'draft' }], folders: [{ id: 3, name: 'Folder', parentId: null }], topics: [{ id: 4, name: 'Topic' }],
    posts: [{ id: 5, title: 'Post', html: '<p>Keep</p>', topicId: 4, templateId: 6, status: 'draft' }], templates: [{ id: 6, name: 'Template', html: '<p>Keep</p>' }],
    contributions: [{ id: 7, category: 'Books', intent: 'free', description: '', enabled: true, visible: true }],
    offerings: [{ id: 8, contributionId: 7, title: 'Book', description: '', pricing: 'free', price: null, details: {}, active: true }],
    updates: [{ id: 9, kind: 'event', title: 'Event', startsAt: '2026-12-01T10:00:00Z', status: 'draft', rsvp: { enabled: true } }], responses: [{ id: 10, eventId: 9, name: 'Visitor' }],
    enquiries: [{ id: 11, subject: 'Question', status: 'new', note: '' }], purchases: [{ id: 'receipt', title: 'Book', status: 'free', fulfilled: true, note: '' }],
    payments: { enabled: true, configured: true }, knowledge: { files: 1, posts: 1, chunks: 3, embedded: 3 },
    users: [{ id: 'other', name: 'User', email: 'user@example.test', slug: 'user', isLocked: false }], invites: [{ id: 12, code: 'CODE', revoked: false }],
  };
}
const plan = (actions, state = snapshot()) => makeStudioPlan({ actions }, state, owner);

test('assistant can change stock or slots and clear limits without accepting invalid quantities', () => {
  for (const quantity of [0, 5, null]) {
    const result = plan([{ entity: 'offerings', action: 'update', id: 8, values: { quantity } }]);
    assert.equal(result.steps[0].args.quantity, quantity);
    const products = plan([{ entity: 'products', action: 'create', values: { title: 'Book', pricing: 'free', quantity } }]);
    assert.equal(products.steps[0].args.portfolio.products[0].quantity, quantity);
  }
  for (const quantity of [-1, 1.5, '5', 1000000001]) assert.throws(() => plan([{ entity: 'offerings', action: 'update', id: 8, values: { quantity } }]), /[Qq]uantity/);
});

test('assistant title edits retain offering paragraphs and remove obsolete sale links', () => {
  const state = snapshot(); state.offerings[0].description = 'First paragraph.\n\nSecond paragraph.';
  state.offerings[0].details = { buy_link: 'https://old-sale.test' };
  const result = plan([{ entity: 'offerings', action: 'update', id: 8, values: { title: 'Renamed' } }], state);
  assert.equal(result.steps[0].args.description, state.offerings[0].description);
  assert.equal(result.steps[0].args.details.buy_link, undefined);
});

test('activity analytics can never become an assistant write action', () => {
  for (const action of ['create', 'update', 'delete']) {
    assert.throws(() => plan([{ entity: 'analytics', action, id: 'current', values: { sales: 999 } }]), /unsupported/);
  }
});

test('every Portfolio list can be created and deleted through a reviewed unified save', () => {
  const cases = { projects: { title: 'Project' }, products: { title: 'Product', pricing: 'free' }, experience: { role: 'Designer' }, talks: { title: 'Talk' }, awards: { title: 'Award' }, domains: { label: 'Design' }, socials: { kind: 'website', url: 'https://example.test/new' }, stats: { value: '10', label: 'Projects' } };
  for (const [entity, values] of Object.entries(cases)) {
    const result = plan([{ entity, action: 'create', values }]);
    assert.equal(result.steps[0].op, 'page.save'); assert.ok(result.steps[0].args.portfolio[entity].length);
    const state = snapshot(); state.settings.portfolio = result.steps[0].args.portfolio;
    const records = studioModelContext(state, [entity], owner)[entity].records;
    const removed = plan([{ entity, action: 'delete', id: records.at(-1).id }], state);
    assert.equal(removed.steps[0].args.portfolio[entity].length, records.length - 1);
  }
});

test('new products default to unspecified pricing and preserve stable generated IDs', () => {
  const result = plan([{ entity: 'products', action: 'create', values: { title: 'Coming soon' } }]);
  const product = result.steps[0].args.portfolio.products[0]; assert.equal(product.pricing, 'unspecified'); assert.match(product.id, /^[a-z0-9-]+$/i);
});

test('review fields show actual edited values without falsely removing record IDs', () => {
  const result = plan([{ entity: 'files', action: 'update', id: 2, values: { name: 'renamed.md' } }]);
  assert.deepEqual(result.changes[0].fields.map(field => field.path), ['name']);
  assert.equal(plan([{ entity: 'files', action: 'update', id: 2, values: { name: 'note.md' } }]).steps.length, 0);
});

test('array edits expose readable field paths instead of the full projects JSON', () => {
  const result = plan([{ entity: 'projects', action: 'update', id: 'index:0', values: { title: 'Renamed' } }]);
  assert.ok(result.changes[0].fields.some(field => field.path === 'portfolio.projects.0.title' && field.after === 'Renamed'));
  assert.deepEqual(studioDiff([{ title: 'Old' }], [{ title: 'New' }], 'projects'), [{ path: 'projects.0.title', before: 'Old', after: 'New' }]);
});

test('duplicate array targets and conflicting parent/child mutations require separate reviews', () => {
  const batches = [
    [{ entity: 'projects', action: 'delete', id: 'index:0' }, { entity: 'projects', action: 'update', id: 'index:0', values: { title: 'Later' } }],
    [{ entity: 'folders', action: 'delete', id: 3 }, { entity: 'files', action: 'update', id: 2, values: { name: 'Later.md' } }],
    [{ entity: 'topics', action: 'delete', id: 4 }, { entity: 'posts', action: 'update', id: 5, values: { title: 'Later' } }],
    [{ entity: 'contributions', action: 'delete', id: 7 }, { entity: 'offerings', action: 'update', id: 8, values: { title: 'Later' } }],
    [{ entity: 'updates', action: 'delete', id: 9 }, { entity: 'responses', action: 'delete', id: 10 }],
  ];
  for (const actions of batches) assert.throws(() => plan(actions), /same|target|linked|separate|batch/i);
});

test('nested profile controls and form fields are strictly validated', () => {
  const cases = [
    ['profile', { visibility: { contact: { email: 'yes' } } }], ['profile', { contact: { unknown: 'Bad' } }],
    ['profile', { education: [{ institution: { run: true } }] }], ['persona', { chips: [{ label: 'Ask', prompt: {} }] }],
    ['updates', { kind: 'invalid' }], ['updates', { rsvp: { questions: [{ label: 'Question', required: 'yes' }] } }],
    ['contributions', { intent: 'invalid' }], ['look', { sections: { store: 'false' } }], ['portfolio', { about: { unknown: 'Text' } }],
  ];
  for (const [entity, values] of cases) assert.throws(() => plan([{ entity, action: 'update', ...(entity === 'updates' ? { id: 9 } : entity === 'contributions' ? { id: 7 } : {}), values }]), /field|valid|true|false|text/i, entity);
});

test('required names cannot silently keep the previous value when asked to clear them', () => {
  for (const [entity, id, key] of [['folders', 3, 'name'], ['topics', 4, 'name'], ['posts', 5, 'title'], ['templates', 6, 'name']]) assert.throws(() => plan([{ entity, action: 'update', id, values: { [key]: '' } }]), /required|name|title/i);
});

test('post edits preserve omitted templates and apply explicit template changes', () => {
  const result = plan([{ entity: 'posts', action: 'update', id: 5, values: { title: 'New title' } }]);
  assert.equal(result.steps[0].args.templateId, 6);
  assert.equal(plan([{ entity: 'posts', action: 'update', id: 5, values: { templateId: null } }]).steps[0].args.templateId, null);
});

test('appending to an HTML file preserves the existing markup and escapes new input', () => {
  const state = snapshot(); state.files[0].name = 'note.html'; state.files[0].text = '<h1>Keep</h1>';
  const result = plan([{ entity: 'files', action: 'update', id: 2, values: { appendText: '<script>Bad</script>' } }], state);
  assert.match(result.steps[0].args.text, /^<h1>Keep<\/h1>/); assert.doesNotMatch(result.steps[0].args.text, /<script>/); assert.match(result.steps[0].args.text, /&lt;script&gt;/);
});

test('offering and enquiry previews match their normalized persisted values', () => {
  const offering = plan([{ entity: 'offerings', action: 'update', id: 8, values: { title: '  A   Book  ', pricing: 'free', price: 12, details: { availability: 'Available now' } } }]);
  assert.equal(offering.changes[0].after.title, 'A Book'); assert.equal(offering.changes[0].after.price, null); assert.equal(offering.steps[0].args.title, 'A Book');
  const enquiry = plan([{ entity: 'enquiries', action: 'update', id: 11, values: { note: '  Done  ' } }]); assert.equal(enquiry.changes[0].after.note, 'Done');
});

test('image removals and settings resets preview the visible result without upload paths', () => {
  for (const entity of ['portrait', 'background', 'look', 'persona', 'portfolio']) {
    const result = plan([{ entity, action: 'delete' }]);
    if (entity === 'portrait') { assert.equal(result.steps[0].args.heroPath, null); assert.equal(result.changes[0].after.heroUrl, null); }
    if (entity === 'background') { assert.equal(result.steps[0].args.path, null); assert.equal(result.changes[0].after.imageUrl, null); }
    assert.ok(result.steps.length <= 1);
  }
});

test('knowledge jobs and incomplete payment commands cannot change unrelated data', () => {
  assert.throws(() => plan([{ entity: 'knowledge', action: 'update', values: { task: 'rebuild' } }, { entity: 'topics', action: 'create', values: { name: 'Topic' } }]), /own|separate|review/i);
  assert.throws(() => plan([{ entity: 'payments', action: 'update', values: {} }]), /field|enabled|change/i);
  const state = snapshot(); state.payments.configured = false;
  assert.throws(() => plan([{ entity: 'payments', action: 'update', values: { enabled: true } }], state), /setup|administrator/i);
});

test('Super Admin edits normalize account values and only revoke existing invitations', () => {
  const result = plan([{ entity: 'users', action: 'update', id: 'other', values: { email: ' USER@EXAMPLE.TEST ', name: '  User  ', slug: 'New Slug', locked: true } }]);
  assert.equal(result.steps[0].args.email, 'user@example.test'); assert.equal(result.steps[0].args.name, 'User'); assert.equal(result.steps[0].args.slug, 'new-slug'); assert.equal(result.steps[1].op, 'users.setLock');
  assert.throws(() => plan([{ entity: 'invites', action: 'update', id: 12, values: { label: 'New' } }]), /revok/i);
  assert.equal(plan([{ entity: 'invites', action: 'delete', id: 12 }]).steps[0].op, 'invites.revoke');
});

test('batches and controls cannot hide unsafe fields or invalid values in nested objects', () => {
  for (const values of [{ chat: { unknown: true } }, { theme: { font: 'unknown' } }, { ball: { size: 'large' } }, { layout: { sidebar: 'top' } }, JSON.parse('{"chat":{"constructor":{}}}')]) assert.throws(() => plan([{ entity: 'persona', action: 'update', values }]), /field|valid|number/i);
});

test('malformed actions in deletion batches are rejected with a readable validation error', () => {
  assert.throws(() => plan([{ entity: 'topics', action: 'delete', id: 4 }, null]), error => error.status === 400);
});

test('the model catalog supplies supported choices for colors, layouts and nested form fields', () => {
  const catalog = studioCatalog(owner);
  assert.ok(catalog.find(item => item.entity === 'look').choices.accent.includes('emerald'));
  assert.ok(catalog.find(item => item.entity === 'persona').choices['layout.photo'].includes('none'));
  assert.match(catalog.find(item => item.entity === 'updates').shape, /questions.*label/);
});

test('remaining admin areas produce complete reviews with safe defaults and existing references', () => {
  const cases = [
    ['folders', { name: 'New folder', parentId: 3 }, 'folders.create'], ['topics', { name: 'New topic', description: 'Research' }, 'topics.create'],
    ['templates', { name: 'My template', body: '## Introduction' }, 'templates.save'], ['updates', { kind: 'event', title: 'Meetup', startsAt: '2026-12-01T10:00:00Z', rsvp: { questions: [{ label: 'What brings you here?', required: true }] } }, 'updates.save'],
    ['contributions', { category: 'Content', intent: 'free', description: 'Helpful guides' }, 'contributions.save'], ['offerings', { contributionId: 7, title: 'Paid guide', pricing: 'paid', price: 100, deliveryKind: 'service' }, 'offerings.save'],
    ['invites', { label: 'Team', maxUses: 3, days: 7 }, 'invites.create'],
  ];
  for (const [entity, values, op] of cases) { const result = plan([{ entity, action: 'create', values }]); assert.equal(result.steps[0].op, op); assert.equal(result.changes[0].kind, 'create'); }
  assert.equal(plan([{ entity: 'payments', action: 'update', values: { enabled: false } }]).steps[0].args.enabled, false);
  const state = snapshot(); state.profile = null;
  assert.equal(plan([{ entity: 'profile', action: 'create', values: { name: 'Ravi', purpose: 'Creating useful products' } }], state).steps[0].args.status, 'draft');
  assert.equal(plan([{ entity: 'profile', action: 'delete' }]).steps[0].op, 'profile.remove');
  assert.equal(plan([{ entity: 'templates', action: 'update', id: 6, values: { appendBody: 'More' } }]).steps[0].args.html, '<p>Keep</p><p>More</p>');
});

test('planning context includes safe target references for file moves, post templates and offerings', () => {
  const context = studioModelContext(snapshot(), ['files', 'posts', 'offerings'], owner);
  assert.equal(context.files.references.folders[0].id, 3); assert.equal(context.files.references.topics[0].name, 'Topic');
  assert.equal(context.posts.references.templates[0].id, 6); assert.equal(context.offerings.references.contributions[0].category, 'Books');
  assert.doesNotMatch(JSON.stringify(context), /example\.test\/access/);
});

test('read commands retain owner enquiry details, attendee notes and safe payment readiness', () => {
  const state = snapshot(); state.enquiries[0].kind = 'Books'; state.enquiries[0].offeringTitle = 'Guide'; state.enquiries[0].budget = '1000'; state.responses[0].note = 'Please reserve a place'; state.payments.testMode = true;
  const context = studioModelContext(state, ['enquiries', 'responses', 'payments'], owner);
  assert.equal(context.enquiries.records[0].kind, 'Books'); assert.equal(context.enquiries.records[0].offeringTitle, 'Guide'); assert.equal(context.responses.records[0].note, 'Please reserve a place'); assert.equal(context.payments.records[0].testMode, true);
});
