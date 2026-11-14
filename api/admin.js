// One serverless function for the whole admin. The browser POSTs { op, args } and gets JSON back.
import { env } from '../server/config.js';
import * as auth from '../server/auth.js';
// Heavy modules are loaded on demand so common requests (sign-in, overview, profile) start fast.
const indexer = new Proxy({}, { get: (_, k) => async (...a) => (await import('../server/indexer.js'))[k](...a) });
const invites = new Proxy({}, { get: (_, k) => async (...a) => (await import('../server/invites.js'))[k](...a) });
const model = async () => (await import('../server/embed.js')).model();
const search = async (...a) => (await import('../server/search.js')).search(...a);
const assistant = new Proxy({}, { get: (_, k) => async (...a) => (await import('../server/studioAssistant.js'))[k](...a) });
import * as profile from '../server/profile.js';
import * as engage from '../server/engage.js';
import * as events from '../server/events.js';
import * as commerce from '../server/commerce.js';
import * as site from '../server/site.js';
import * as store from '../server/store.js';
import * as assets from '../server/assets.js';
import * as catalogue from '../server/catalogue.js';
import { listQuestions } from '../server/chatHistory.js';
import { listStudioHistory } from '../server/studioChatHistory.js';
import { scoped } from '../server/tenant.js';
import { HttpError } from '../server/http.js';
import { createSuggestionService, needSuperAdmin } from '../server/governance.js';
import { createTagService } from '../server/tags.js';
import { createActivityService } from '../server/adminActivity.js';
import { createPlatformService } from '../server/platform.js';
import { createSupportService } from '../server/platformSupport.js';

export function createPlatformOperations({ invitesService = invites, suggestionsService = createSuggestionService(), platformService = createPlatformService(), tagsService = createTagService(), supportService = createSupportService() } = {}) {
  return {
    'invites.list': ({ user }) => invitesService.listInviteHistory(user),
    'invites.create': async ({ user }, args) => ({ code: await invitesService.createInvite(user.id, args) }),
    'invites.revoke': async ({ user }, args) => { await invitesService.revokeInvite(args.id, user); return { ok: true }; },
    'users.list': async ctx => { needSuperAdmin(ctx); return { users: (await invitesService.listUsersDetailed()).filter(user => !user.isSuperAdmin), tags: await tagsService.list() }; },
    'users.update': (ctx, args) => { needSuperAdmin(ctx); return invitesService.updateUser(args.id, args); },
    'users.setLock': (ctx, args) => { needSuperAdmin(ctx); if (typeof args.locked !== 'boolean') throw new HttpError(400, 'Choose lock or unlock.'); return invitesService.setUserLock(args.id, args.locked, ctx.user.id); },
    'users.resetPassword': (ctx, args) => { needSuperAdmin(ctx); return invitesService.resetUserPassword(args.id, args.password); },
    'users.delete': (ctx, args) => { needSuperAdmin(ctx); return invitesService.deleteUser(args.id, ctx.user.id); },
    'suggestions.list': async ({ user }) => ({ rows: await suggestionsService.list(user) }),
    'suggestions.create': ({ user }, args) => suggestionsService.create(user, args),
    'suggestions.update': ({ user }, args) => suggestionsService.update(user, args),
    'support.list': async ({ user }) => ({ rows: await supportService.list(user) }),
    'support.create': ({ user }, args) => supportService.create(user, args),
    'support.get': ({ user }, args) => supportService.get(user, args),
    'support.reply': ({ user }, args) => supportService.reply(user, args),
    'platform.tags.list': async () => ({ tags: await tagsService.list() }),
    'platform.tags.create': async ({ user }, args) => ({ tag: await tagsService.create(user, args) }),
    'platform.sales': ({ user }) => platformService.sales(user),
    'platform.payments.setEnabled': ({ user }, args) => platformService.setCheckout(user, args),
    'platform.home.get': async ctx => { needSuperAdmin(ctx); return { settings: await platformService.home() }; },
    'platform.home.save': async ({ user }, args) => ({ settings: await platformService.saveHome(user, args) }),
  };
}

// Public ops (no session needed)
const PUBLIC = {
  'auth.config': async () => ({ mode: auth.registrationMode() }),
  'auth.me': async (_, __, { req }) => ({ user: await auth.sessionUser(req) }),
  'auth.logout': async (_, __, { res }) => { auth.endSession(res); return { ok: true }; },
  'auth.register': async (args, _, { res }) => {
    const r = await auth.register(args);
    if (r.user) await auth.startSession(res, r.user);
    return r;
  },
  'auth.login': async (args, _, { res }) => {
    const r = await auth.login(args);
    if (r.user) await auth.startSession(res, r.user);
    return r;
  },
  'invites.validate': async ({ code }) => invites.validateInvite(code),
};

// Signed-in ops. `db` is the tenant-scoped client; `s` is the store module bound to it.
const activityService = createActivityService();
const OPS = {
  'items.list': ({ db }) => catalogue.listItems(db),
  'items.save': ({ db }, a) => catalogue.saveItem(db, a),
  'items.delete': async ({ db }, a) => { await catalogue.deleteItem(db, a); return { ok: true }; },
  'assets.sign': ({ db }, a) => assets.signAsset(db, a),
  'assets.register': ({ db }, a) => assets.registerAsset(db, a),
  'assets.open': ({ db }, a) => assets.downloadAsset(db, a.id),
  'activity.resume': ctx => activityService.resume(ctx),
  'activity.touch': ctx => activityService.touch(ctx),
  'activity.report': ctx => activityService.report(ctx),
  'studio.history': (ctx, a) => listStudioHistory(ctx, a),
  'studio.prepare': (ctx, a) => assistant.prepareStudioCommand(ctx, a),
  'studio.apply': (ctx, a) => assistant.applyStudioCommand(ctx, a),
  'studio.discard': (ctx, a) => assistant.discardStudioCommand(ctx, a),
  'studio.review': (ctx, a) => assistant.studioCommandReview(ctx, a),
  overview: async ({ db }) => {
    const [counts, files] = await Promise.all([store.counts(db), store.allFiles(db)]);
    const recent = [...files].sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '')).slice(0, 8);
    return { counts, recent };
  },

  // profile (AI registration)
  'profile.get': ({ db }) => profile.getProfile(db),
  'profile.extract': ({ db }, a) => profile.extract(db, a.text),
  'profile.confirm': ({ db }, a) => profile.confirmProfile(db, a),
  'profile.save': ({ db }, a) => profile.saveProfile(db, a),
  'profile.visibility': async ({ db }, a) => { await profile.setVisibility(db, a.visibility); return { ok: true }; },
  'profile.status': async ({ db }, a) => { await profile.setStatus(db, a.status); return { ok: true }; },
  'contributions.save': ({ db }, a) => profile.saveContribution(db, a),
  'contributions.delete': async ({ db }, a) => { await profile.deleteContribution(db, a.id); return { ok: true }; },
  'offerings.save': ({ db }, a) => profile.saveOffering(db, a),
  'offerings.delete': async ({ db }, a) => { await profile.deleteOffering(db, a.id); return { ok: true }; },

  // site look (background image)
  'site.get': ({ db }) => site.getSettings(db),
  'site.sign': ({ db }, a) => site.signBackground(db, a),
  'site.save': ({ db }, a) => site.saveSettings(db, a),

  // public profile page (/p/<slug>): look + live preview data
  'page.save': ({ db }, a) => site.savePage(db, a),
  'page.preview': ({ db, user }) => profile.previewProfile(db, user.slug),

  // updates & schedule (shown on the public profile)
  'updates.list': ({ db }) => engage.listUpdates(db),
  'updates.save': ({ db }, a) => engage.saveUpdate(db, a),
  'updates.delete': async ({ db }, a) => { await engage.deleteUpdate(db, a.id); return { ok: true }; },
  'events.responses': ({ db }, a) => events.listResponses(db, a),
  'events.deleteResponse': ({ db }, a) => events.deleteResponse(db, a),
  'purchases.list': ({ db }, a) => commerce.listPurchases(db, a),
  'purchases.fulfill': ({ db }, a) => commerce.fulfillPurchase(db, a),
  'payments.settings': ({ db }) => commerce.paymentSettings(db),
  'payments.saveSettings': ({ db }, a) => commerce.savePaymentSettings(db, a),

  // enquiries sent through the contact form on the public profile
  'enquiries.list': ({ db }) => engage.listEnquiries(db),
  'enquiries.count': ({ db }) => engage.countNewEnquiries(db),
  'enquiries.update': ({ db }, a) => engage.updateEnquiry(db, a),
  'enquiries.delete': async ({ db }, a) => { await engage.deleteEnquiry(db, a.id); return { ok: true }; },

  // Visitor questions and the persona replies, private to the profile owner.
  'chat.list': ({ db }, a) => listQuestions(db, a),

  // folders
  'folders.all': ({ db }) => store.allFolders(db),
  'folders.create': ({ db }, a) => store.createFolder(db, a.parentId, a.name),
  'folders.rename': async ({ db }, a) => { await store.renameFolder(db, a.id, a.name); return { ok: true }; },
  'folders.delete': async ({ db }, a) => { await store.deleteFolder(db, a.id); return { ok: true }; },

  // files
  'files.list': ({ db }, a) => (a.q ? store.searchFiles(db, a.q) : store.listFiles(db, a.folderId)),
  'files.all': ({ db }) => store.allFiles(db),
  'files.get': ({ db }, a) => store.getFile(db, a.id),
  'files.signUploads': ({ db }, a) => store.signUploads(db, a.names),
  'files.register': ({ db }, a) => store.registerFile(db, a),
  'files.createText': ({ db }, a) => store.createTextFile(db, a),
  'files.save': async ({ db }, a) => { await store.saveFile(db, a.id, a); return { ok: true }; },
  'files.move': async ({ db }, a) => { await store.moveFile(db, a.id, a.folderId); return { ok: true }; },
  'files.delete': async ({ db }, a) => { await store.deleteFile(db, a.id); return { ok: true }; },
  'files.url': async ({ db }, a) => ({ url: await store.signedUrl(db, a.id) }),

  // topics
  'topics.list': ({ db }) => store.topics(db),
  'topics.create': ({ db }, a) => store.createTopic(db, a.name, a.description),
  'topics.update': async ({ db }, a) => { await store.updateTopic(db, a.id, a.name, a.description); return { ok: true }; },
  'topics.delete': async ({ db }, a) => { await store.deleteTopic(db, a.id); return { ok: true }; },

  // posts
  'posts.list': ({ db }) => store.posts(db),
  'posts.get': ({ db }, a) => store.getPost(db, a.id),
  'posts.create': ({ db }, a) => store.createPost(db, a),
  'posts.save': async ({ db }, a) => { await store.savePost(db, a.id, a); return { ok: true }; },
  'posts.delete': async ({ db }, a) => { await store.deletePost(db, a.id); return { ok: true }; },

  // templates
  'templates.list': ({ db }) => store.templates(db),
  'templates.save': async ({ db }, a) => { await store.saveTemplate(db, a.id, a.name, a.html); return { ok: true }; },
  'templates.delete': async ({ db }, a) => { await store.deleteTemplate(db, a.id); return { ok: true }; },

  // knowledge index
  'index.counts': ({ db }) => store.counts(db),
  'index.sources': async ({ db }, a) => { for (const id of a.ids) await indexer.indexSource(db, a.kind, id); return { ok: true }; },
  'index.refresh': ({ db }, a) => indexer.refresh(db, a.kind, a.id, a.seconds ?? 30),
  'index.sync': ({ db }) => indexer.syncSources(db),
  'index.embed': ({ db }, a) => indexer.embedPending(db, Math.min(+a.seconds || 40, 50)),
  'index.rebuild': async ({ db }) => { await indexer.rebuildAll(db); return { ok: true }; },
  'index.test': ({ db }, a) => search(db, a.q),
  'index.log': ({ db }) => store.chatLog(db),
  'index.settings': async () => ({ model: await model(), minSimilarity: env('MIN_SIMILARITY', 0.6), minKeywordRank: env('MIN_KEYWORD_RANK', 0.2) }),

  ...createPlatformOperations(),
};

export function createAdminHandler({ sessionUser = auth.sessionUser, scoped: tenantScope = scoped, operations = OPS } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const { op, args = {} } = req.body || {};
    try {
      if (Object.hasOwn(PUBLIC, op)) return res.status(200).json(await PUBLIC[op](args, null, { req, res }));
      const fn = Object.hasOwn(operations, op) ? operations[op] : null;
      if (!fn) throw new HttpError(404, `Unknown operation: ${op}`);
      const user = await sessionUser(req);
      if (!user) throw new HttpError(401, 'Not signed in.');
      const platformOp = /^(users\.|invites\.|suggestions\.|support\.|platform\.)/.test(op);
      if (user.isSuperAdmin && !platformOp) throw new HttpError(403, 'SuperAdmin accounts manage the platform and do not have a personal Studio.');
      return res.status(200).json(await fn({ db: platformOp ? null : tenantScope(user.id), user }, args));
    } catch (e) {
      const studio = typeof op === 'string' && op.startsWith('studio.');
      if (!(e instanceof HttpError)) console.error(op, studio ? e.name || 'error' : e);
      return res.status(e.status || 500).json({ error: studio && !(e instanceof HttpError) ? 'The admin assistant could not complete this request. Please try again.' : e.message || 'Something went wrong.' });
    }
  };
}
export default createAdminHandler();
