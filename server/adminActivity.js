import { HttpError } from './http.js';
import { activitySummary } from '../shared/adminActivity.js';
import { workspaceIdentity } from './workspacePermissions.js';
const identity = ctx => { if (ctx.user?.isSuperAdmin) throw new HttpError(401, 'Your signed-in admin identity and scope must agree.'); return workspaceIdentity(ctx); };
async function rpc(ctx, fn) {
  identity(ctx);
  const { data, error } = await ctx.db.rpc(fn);
  if (error) throw new HttpError(503, 'Activity insights are unavailable. Check the admin-experience database setup and try again.');
  if (!data || typeof data !== 'object') throw new HttpError(503, 'Activity insights could not be loaded. Please try again.');
  return data;
}
export function createActivityService() {
  return {
    async resume(ctx) { return activitySummary(await rpc(ctx, 'resume_admin_activity')); },
    async touch(ctx) { await rpc(ctx, 'touch_admin_activity'); return { ok: true }; },
    report: ctx => rpc(ctx, 'admin_analytics'),
  };
}
