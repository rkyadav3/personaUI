import { HttpError } from './http.js';
import { activitySummary } from '../shared/adminActivity.js';
const identity = ctx => { if (!ctx.user?.id || ctx.user.isSuperAdmin || ctx.db?.uid !== ctx.user.id) throw new HttpError(401, 'Your signed-in admin identity and scope must agree.'); };
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
