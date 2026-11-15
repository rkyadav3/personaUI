import { raw, run } from './supabase.js';
import { HttpError } from './http.js';

export async function listKnowledgeSources(db) {
  if (!db?.workspaceId) throw new HttpError(400, 'Enable workspace setup before managing source access.');
  const common = 'id,status,audience,valid_from,valid_until,revision';
  const [files, posts] = await Promise.all([
    run(db.from('files').select(`${common},name`).order('id').limit(100)),
    run(db.from('posts').select(`${common},title`).order('id').limit(100)),
  ]);
  return { sources: [...files.map(row => ({ ...row, kind: 'file', label: row.name })), ...posts.map(row => ({ ...row, kind: 'post', label: row.title }))], limitPerKind: 100 };
}

export function createKnowledgePolicyService({ database = raw } = {}) {
  return {
    async save(access, input) {
      if (!access?.workspace?.id || !['owner', 'admin'].includes(access.role)) throw new HttpError(403, 'Only a workspace administrator can change source access.');
      if (!['file', 'post'].includes(input?.kind) || !Number.isSafeInteger(Number(input.id)) || Number(input.id) <= 0 ||
          !['public', 'internal'].includes(input.audience) || !Number.isSafeInteger(Number(input.revision)) || Number(input.revision) < 1) {
        throw new HttpError(400, 'Choose a source and its audience.');
      }
      const date = value => { if (!value) return null; const parsed = Date.parse(value); if (!Number.isFinite(parsed)) throw new HttpError(400, 'Enter a valid date.'); return new Date(parsed).toISOString(); };
      const from = date(input.validFrom), until = date(input.validUntil);
      if (from && until && Date.parse(until) <= Date.parse(from)) throw new HttpError(400, 'The end date must be after the start date.');
      return run(database().rpc('set_source_policy', {
        p_user: access.actorId, p_workspace: access.workspace.id, p_kind: input.kind, p_source: Number(input.id),
        p_audience: input.audience, p_valid_from: from, p_valid_until: until, p_revision: Number(input.revision),
      }));
    },
  };
}
