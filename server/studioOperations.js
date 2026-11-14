import * as storeDefault from './store.js';
import * as profileDefault from './profile.js';
import * as siteDefault from './site.js';
import * as engageDefault from './engage.js';
import * as eventsDefault from './events.js';
import * as commerceDefault from './commerce.js';
import { paged } from './supabase.js';
import { HttpError } from './http.js';
import { STUDIO_ENTITIES } from '../shared/studioAssistant.js';
import { createActivityService } from './adminActivity.js';

const lazy = path => new Proxy({}, { get: (_, key) => async (...args) => (await import(path))[key](...args) });
const fields = (row, keys) => Object.fromEntries(keys.split(' ').filter(key => Object.hasOwn(row || {}, key)).map(key => [key, row[key]]));
const identity = ctx => { if (!ctx?.user?.id || ctx.db?.uid !== ctx.user.id) throw new HttpError(401, 'Your signed-in identity and tenant scope must agree.'); };
const dependencies = { customization: ['offerings'], products: ['assets'], files: ['folders', 'topics'], folders: ['files'], topics: ['files', 'posts'], posts: ['topics', 'templates'], templates: ['topics'], offerings: ['contributions', 'assets'], contributions: ['offerings'], updates: ['responses'], responses: ['updates'] };

/** The assistant can only call this fixed set of existing, owner-scoped admin services. */
export function createStudioOperations({ store = storeDefault, profile = profileDefault, site = siteDefault, engage = engageDefault, events = eventsDefault, commerce = commerceDefault, invites = lazy('./invites.js'), indexer = lazy('./indexer.js'), rows = paged } = {}) {
  const table = (db, name, columns) => rows(db, name, columns, query => query.order('id'));
  const readers = {
    analytics: ctx => createActivityService().report(ctx),
    settings: ({ db }) => site.getSettings(db),
    profile: async ({ db }) => (await table(db, 'profiles', 'id,name,purpose,education,contact,experience,designation,expertise,visibility,status')).map(row => fields(row, 'id name purpose education contact experience designation expertise visibility status'))[0] || null,
    files: async ({ db }) => (await table(db, 'files', 'id,name,text_content,folder_id,topic_id,status,mime,size')).map(row => ({ ...fields(row, 'id name status mime size'), text: row.text_content || '', folderId: row.folder_id ?? null, topicId: row.topic_id ?? null })),
    folders: async ({ db }) => (await table(db, 'folders', 'id,name,parent_id')).map(row => ({ ...fields(row, 'id name'), parentId: row.parent_id ?? null })),
    topics: async ({ db }) => (await table(db, 'topics', 'id,name,description')).map(row => fields(row, 'id name description')),
    posts: async ({ db }) => (await table(db, 'posts', 'id,title,html,status,topic_id,template_id')).map(row => ({ ...fields(row, 'id title html status'), topicId: row.topic_id ?? null, templateId: row.template_id ?? null })),
    templates: async ({ db }) => (await store.templates(db)).map(row => fields(row, 'id name html')),
    contributions: async ({ db }) => (await table(db, 'contributions', 'id,category,subtype,description,intent,enabled,visible')).map(row => fields(row, 'id category subtype description intent enabled visible')),
    offerings: async ({ db }) => (await table(db, 'offerings', 'id,contribution_id,title,description,pricing,price,currency,details,active,delivery_asset_id,delivery_kind')).map(row => ({ ...fields(row, 'id title description pricing price currency details active'), contributionId: row.contribution_id, assetId: row.delivery_asset_id || '', deliveryKind: row.delivery_kind || 'file' })),
    assets: async ({ db }) => (await table(db, 'assets', 'id,name,purpose,mime,status')).filter(row => row.status === 'ready').map(row => fields(row, 'id name purpose mime')),
    updates: ({ db }) => engage.listUpdates(db),
    responses: async ({ db }) => (await table(db, 'event_responses', 'id,event_id,name,email,phone,response,public_name,note,answers,created_at,updated_at')).map(row => ({ ...fields(row, 'id name email phone response note answers'), eventId: row.event_id, publicName: row.public_name || '', createdAt: row.created_at, updatedAt: row.updated_at })),
    enquiries: async ({ db }) => (await engage.listEnquiries(db)).rows,
    purchases: async ({ db }) => {
      const result = [];
      for (let page = 1; ; page++) {
        const value = await commerce.listPurchases(db, { page });
        result.push(...value.rows.map(row => ({ ...fields(row, 'id title kind itemId amount currency status refundedAmount buyer paymentId orderId fulfillmentStatus createdAt paidAt note deliveryUrl'), fulfilled: row.fulfillmentStatus === 'fulfilled' })));
        if (result.length >= value.total) return result;
        if (!value.rows.length) throw new HttpError(409, 'Purchase records changed while loading. Please try the command again.');
      }
    },
    payments: async ({ db }) => fields(await commerce.paymentSettings(db), 'mode enabled configured webhookConfigured encryptionReady testMode'),
    knowledge: ({ db }) => store.counts(db),
    users: async () => (await invites.listUsersDetailed()).map(row => ({ ...fields(row, 'id name email slug isLocked isAdmin'), createdAt: row.created_at, lockedUntil: row.locked_until, profileStatus: row.profile_status, designation: row.designation })),
    invites: async ({ user }) => (await invites.listInviteHistory(user)).codes.map(row => ({ ...fields(row, 'id code label uses revoked'), maxUses: row.max_uses, expiresAt: row.expires_at, createdAt: row.created_at })),
  };
  const op = (entity, run) => ({ entity, run });
  const operations = {
    'profile.assistantSave': op('profile', (ctx, a) => profile.saveAssistantProfile(ctx.db, a)),
    'profile.remove': op('profile', (ctx, a) => profile.deleteAssistantProfile(ctx.db, a)),
    'page.save': op('portfolio', (ctx, a) => site.savePage(ctx.db, a)),
    'contributions.save': op('contributions', (ctx, a) => profile.saveContribution(ctx.db, a)),
    'contributions.delete': op('contributions', (ctx, a) => profile.deleteContribution(ctx.db, a.id)),
    'offerings.save': op('offerings', (ctx, a) => profile.saveOffering(ctx.db, a)),
    'offerings.delete': op('offerings', (ctx, a) => profile.deleteOffering(ctx.db, a.id)),
    'updates.save': op('updates', (ctx, a) => engage.saveUpdate(ctx.db, a)),
    'updates.delete': op('updates', (ctx, a) => engage.deleteUpdate(ctx.db, a.id)),
    'events.deleteResponse': op('responses', (ctx, a) => events.deleteResponse(ctx.db, a)),
    'enquiries.update': op('enquiries', (ctx, a) => engage.updateEnquiry(ctx.db, a)),
    'enquiries.delete': op('enquiries', (ctx, a) => engage.deleteEnquiry(ctx.db, a.id)),
    'purchases.fulfill': op('purchases', (ctx, a) => commerce.fulfillPurchase(ctx.db, a)),
    'payments.saveSettings': op('payments', (ctx, a) => commerce.savePaymentSettings(ctx.db, a)),
    'folders.create': op('folders', (ctx, a) => store.createFolder(ctx.db, a.parentId, a.name)),
    'folders.rename': op('folders', (ctx, a) => store.renameFolder(ctx.db, a.id, a.name)),
    'folders.delete': op('folders', (ctx, a) => store.deleteFolder(ctx.db, a.id)),
    'files.createText': op('files', (ctx, a) => store.createTextFile(ctx.db, a)),
    'files.save': op('files', (ctx, a) => store.saveFile(ctx.db, a.id, a)),
    'files.delete': op('files', (ctx, a) => store.deleteFile(ctx.db, a.id)),
    'topics.create': op('topics', (ctx, a) => store.createTopic(ctx.db, a.name, a.description)),
    'topics.update': op('topics', (ctx, a) => store.updateTopic(ctx.db, a.id, a.name, a.description)),
    'topics.delete': op('topics', (ctx, a) => store.deleteTopic(ctx.db, a.id)),
    'posts.create': op('posts', (ctx, a) => store.createPost(ctx.db, a)),
    'posts.save': op('posts', (ctx, a) => store.savePost(ctx.db, a.id, a)),
    'posts.delete': op('posts', (ctx, a) => store.deletePost(ctx.db, a.id)),
    'templates.save': op('templates', (ctx, a) => store.saveTemplate(ctx.db, a.id, a.name, a.html)),
    'templates.delete': op('templates', (ctx, a) => store.deleteTemplate(ctx.db, a.id)),
    'index.sync': op('knowledge', async ctx => { const value = await indexer.syncSources(ctx.db); return value?.added ? { ...value, warning: 'Sources synchronized. Run “Embed my knowledge” in a new review to make pending chunks available to Chat.' } : value; }),
    'index.embed': op('knowledge', async ctx => { const value = await indexer.embedPending(ctx.db, 35); return value?.remaining ? { ...value, warning: `${value.done} chunks embedded; ${value.remaining} remaining. Run another embedding command or use Knowledge Base to continue.` } : value; }),
    'index.rebuild': op('knowledge', (ctx) => indexer.rebuildAll(ctx.db)),
    'users.update': op('users', (ctx, a) => invites.updateUser(a.id, a)),
    'users.setLock': op('users', (ctx, a) => invites.setUserLock(a.id, a.locked, ctx.user.id)),
    'users.delete': op('users', (ctx, a) => invites.deleteUser(a.id, ctx.user.id)),
    'invites.create': op('invites', async (ctx, a) => ({ code: await invites.createInvite(ctx.user.id, a) })),
    'invites.revoke': op('invites', (ctx, a) => invites.revokeInvite(a.id, ctx.user)),
  };
  return {
    async read(ctx, entities) {
      identity(ctx);
      const roots = new Set();
      for (const entity of entities) {
        if (!Object.hasOwn(STUDIO_ENTITIES, entity)) throw new HttpError(400, 'Unknown admin area.');
        if (STUDIO_ENTITIES[entity].admin && !ctx.user.isSuperAdmin) throw new HttpError(403, 'Super Admin permission is required.');
        roots.add(STUDIO_ENTITIES[entity].root);
        (dependencies[entity] || []).forEach(root => roots.add(root));
      }
      return Object.fromEntries(await Promise.all([...roots].map(async root => [root, await readers[root](ctx)])));
    },
    async execute(ctx, step) {
      identity(ctx);
      const operation = Object.hasOwn(operations, step?.op) ? operations[step.op] : null;
      if (!operation || operation.entity !== step.entity) throw new HttpError(400, 'Unsupported admin command operation or area.');
      if (STUDIO_ENTITIES[operation.entity].admin && !ctx.user.isSuperAdmin) throw new HttpError(403, 'Super Admin permission is required.');
      return operation.run(ctx, step.args);
    },
  };
}
const production = createStudioOperations();
export const readStudioState = (ctx, entities) => production.read(ctx, entities);
export const executeStudioStep = (ctx, step) => production.execute(ctx, step);
