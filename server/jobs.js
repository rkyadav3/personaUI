import { randomUUID } from 'node:crypto';
import { raw, run } from './supabase.js';
import { createAssetStorage } from './assetStorage.js';
import { ASSET_BUCKET } from '../shared/assets.js';
import { createPublicRepository } from './publicRepository.js';
import { HttpError } from './http.js';
import { normalizeJob, normalizeApplication, resumeSpec } from '../shared/jobs.js';
import { isJobsProfile } from '../shared/jobsProfile.js';
const uuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
const checked = (fn) => {
  try {
    return fn();
  } catch (error) {
    throw new HttpError(400, error.message);
  }
};
export const listJobs = (db) =>
  run(db.from('jobs').select('*').order('created_at', { ascending: false }).limit(300));
export async function saveJob(db, input) {
  const values = checked(() => normalizeJob(input));
  if (input.id && !uuid(input.id)) throw new HttpError(400, 'Choose a valid job.');
  const rows = await run(
    input.id
      ? db
          .from('jobs')
          .update({ ...values, updated_at: new Date().toISOString() })
          .eq('id', input.id)
          .select('*')
      : db
          .from('jobs')
          .insert({ id: randomUUID(), ...values })
          .select('*')
  );
  if (!rows?.length) throw new HttpError(404, 'Job not found in this profile.');
  return rows[0];
}
export async function deleteJob(db, id) {
  if (!uuid(id)) throw new HttpError(400, 'Choose a valid job.');
  await run(db.from('jobs').delete().eq('id', id));
  return { ok: true };
}
export function createJobPublicService({
  database = raw,
  storage = createAssetStorage(),
  repository = createPublicRepository(database),
} = {}) {
  async function jobFor(input) {
    if (!uuid(input.jobId)) throw new HttpError(400, 'Choose a valid job.');
    const owner = await repository.owner(String(input.slug || ''));
    if (!owner) throw new HttpError(404, 'This profile is not available.');
    const [job] = await run(
      database()
        .from('jobs')
        .select('*')
        .eq('id', input.jobId)
        .eq('owner_id', owner.id)
        .eq('status', 'published')
        .limit(1)
    );
    if (!job || (job.closes_at && Date.parse(job.closes_at) <= Date.now()))
      throw new HttpError(404, 'This job is no longer accepting applications.');
    return job;
  }
  return {
    async list(slug) {
      const owner = await repository.owner(slug);
      if (!owner) throw new HttpError(404, 'This profile is not available.');
      const rows = await run(
        database()
          .from('jobs')
          .select(
            'id,title,description,requirements,location,employment_type,workplace,salary,closes_at,created_at'
          )
          .eq('owner_id', owner.id)
          .eq('status', 'published')
          .order('created_at', { ascending: false })
          .limit(300)
      );
      return { jobs: rows.filter((job) => !job.closes_at || Date.parse(job.closes_at) > Date.now()) };
    },
    async upload(input, ip) {
      const spec = checked(() => resumeSpec(input)),
        job = await jobFor(input);
      await repository.claim(job.owner_id, 'job', ip);
      const id = randomUUID(),
        path = `${job.owner_id}/${id}.${spec.extension}`;
      await run(
        database()
          .from('job_resumes')
          .insert({
            id,
            job_id: job.id,
            owner_id: job.owner_id,
            workspace_id: job.workspace_id,
            name: spec.name,
            mime: spec.mime,
            size: spec.size,
            storage_path: path,
          })
      );
      const { data, error } = await storage.signUpload(path);
      if (error || !data?.token) throw new HttpError(503, 'Résumé storage is unavailable. Try again.');
      return { id, path, token: data.token, mime: spec.mime, bucket: ASSET_BUCKET };
    },
    async submit(input, ip, applicant = null) {
      if (input.shareProfile && (input.shareProfile !== true || !applicant?.id || !isJobsProfile(applicant))) throw new HttpError(403, 'Sign in to your Jobs Profile to share it with this application.');
      const values = checked(() => normalizeApplication(input)),
        job = await jobFor(input);
      await repository.claim(job.owner_id, 'job', ip);
      if (input.resumeId) {
        if (!uuid(input.resumeId)) throw new HttpError(400, 'Choose a valid résumé upload.');
        const [resume] = await run(
          database()
            .from('job_resumes')
            .select('*')
            .eq('id', input.resumeId)
            .eq('job_id', job.id)
            .eq('owner_id', job.owner_id)
            .limit(1)
        );
        if (!resume || resume.submitted || Date.parse(resume.created_at) < Date.now() - 86400000)
          throw new HttpError(409, 'Upload your résumé again.');
        const { data, error } = await storage.info(resume.storage_path);
        if (
          error ||
          Number(data?.size ?? data?.metadata?.size) !== Number(resume.size) ||
          (data?.content_type ?? data?.contentType ?? data?.metadata?.mimetype) !== resume.mime
        )
          throw new HttpError(409, 'The uploaded résumé does not match its size or type. Upload it again.');
      }
      await run(
        database().rpc(input.shareProfile ? 'submit_job_profile_application' : 'submit_job_application', {
          p_job: job.id,
          p_resume: input.resumeId || null,
          p_input: values,
          ...(input.shareProfile ? { p_applicant: applicant.id } : {}),
        })
      );
      return { ok: true };
    },
  };
}
export async function openResume(db, id, storage = createAssetStorage()) {
  if (!uuid(id)) throw new HttpError(400, 'Choose a valid résumé.');
  const [resume] = await run(db.from('job_resumes').select('*').eq('id', id).eq('submitted', true).limit(1));
  if (!resume || resume.owner_id !== db.uid) throw new HttpError(404, 'Résumé not found in this profile.');
  const { data, error } = await storage.signDownload(resume.storage_path, resume.name, 60);
  if (error || !data?.signedUrl) throw new HttpError(503, 'The résumé cannot be opened right now.');
  return { url: data.signedUrl };
}
