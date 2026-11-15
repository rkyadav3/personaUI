import { HttpError } from './http.js';
const reads = new Set(['overview','profile.get','site.get','folders.all','files.list','files.all','files.get','files.url','topics.list','posts.list','posts.get','templates.list','index.counts','index.settings','knowledge.sources','team.list']);
const contentWrites = new Set(['files.signUploads','files.register','files.createText','files.save','files.move','files.delete','folders.create','folders.rename','folders.delete','posts.create','posts.save','posts.delete','topics.create','topics.update','topics.delete','templates.save','templates.delete','index.sources','index.refresh','index.sync','index.embed','index.test']);
export function authorizeWorkspaceOperation(role, op) {
  if (['owner','admin'].includes(role)) return;
  if (reads.has(op) || role==='contributor' && contentWrites.has(op)) return;
  throw new HttpError(403,'Your workspace role does not allow this action.');
}
export function workspaceIdentity(ctx) {
  if (!ctx?.user?.id || !ctx.db?.uid) throw new HttpError(401,'Not signed in.');
  if (ctx.workspace) {
    if (ctx.workspace.actorId!==ctx.user.id || ctx.workspace.ownerId!==ctx.db.uid || ctx.workspace.workspace.id!==ctx.db.workspaceId) throw new HttpError(401,'Your signed-in identity and workspace scope must agree.');
  } else if (ctx.db.uid!==ctx.user.id) throw new HttpError(401,'Your signed-in identity and tenant scope must agree.');
  return ctx.db.uid;
}

