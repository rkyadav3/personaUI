// One serverless function for the whole admin. The browser POSTs { op, args } and gets JSON back.
import { env } from '../server/config.js';
import * as auth from '../server/auth.js';
import * as indexer from '../server/indexer.js';
import * as invites from '../server/invites.js';
import { model } from '../server/embed.js';
import { search } from '../server/search.js';
import * as profile from '../server/profile.js';
import * as site from '../server/site.js';
import * as store from '../server/store.js';
import { scoped } from '../server/tenant.js';

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const needAdmin = ({ user }) => { if (!user.isAdmin) throw new HttpError(403, 'This page is for admins. Add your email to ADMIN_EMAILS.'); };

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
};

// Signed-in ops. `db` is the tenant-scoped client; `s` is the store module bound to it.
const OPS = {
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
  'index.settings': async () => ({ model: model(), minSimilarity: env('MIN_SIMILARITY', 0.6), minKeywordRank: env('MIN_KEYWORD_RANK', 0.2) }),

  // invites (admin only)
  'invites.list': async ctx => { needAdmin(ctx); const [codes, users] = await Promise.all([invites.listInvites(), invites.listUsers()]); return { codes, users }; },
  'invites.create': async (ctx, a) => { needAdmin(ctx); return { code: await invites.createInvite(ctx.user.id, a) }; },
  'invites.revoke': async (ctx, a) => { needAdmin(ctx); await invites.revokeInvite(a.id); return { ok: true }; },
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { op, args = {} } = req.body || {};
  try {
    if (PUBLIC[op]) return res.status(200).json(await PUBLIC[op](args, null, { req, res }));
    const fn = OPS[op];
    if (!fn) throw new HttpError(404, `Unknown operation: ${op}`);
    const user = await auth.sessionUser(req);
    if (!user) throw new HttpError(401, 'Not signed in.');
    return res.status(200).json(await fn({ db: scoped(user.id), user }, args));
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(op, e);
    return res.status(e.status || 500).json({ error: e.message || 'Something went wrong.' });
  }
}
