import { useEffect, useState } from 'react';
import { Field, Loading, Notice } from '../Ui.jsx';
import FormDialog from '../FormDialog.jsx';
import { uploadToSigned } from '../../lib/storage.js';
import { useAuth } from '../../lib/auth.jsx';
import { isJobsProfile } from '../../../shared/jobsProfile.js';
async function request(input) {
  const response = await fetch('/api/enquiry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The application could not be sent.');
  return result;
}
export default function JobsPage({ ctx }) {
  const { user } = useAuth();
  const [jobs, setJobs] = useState(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [selected, setSelected] = useState(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [form, setForm] = useState({
      name: '',
      email: '',
      phone: '',
      resumeUrl: '',
      message: '',
      consent: false,
      shareProfile: false,
    }),
    [file, setFile] = useState(null);
  useEffect(() => {
    let active = true;
    setError('');
    if (ctx.preview) {
      setJobs([]);
      return;
    }
    fetch(`/api/enquiry?kind=jobs&slug=${encodeURIComponent(ctx.slug)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Jobs could not be loaded.');
        if (active) setJobs(data.jobs);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [ctx.slug, ctx.preview, attempt]);
  const update = (key, value) => setForm({ ...form, [key]: value });
  return (
    <section className="pf-wrap pf-sec">
      <h1>Jobs</h1>
      <p className="pf-lead">Explore current openings and apply directly to this profile.</p>
      <Notice kind="success">{notice}</Notice>
      {!jobs ? (
        <>
          <Loading error={error} label="Loading jobs…" />
          {error && (
            <button className="btn" onClick={() => setAttempt(attempt + 1)}>
              Retry
            </button>
          )}
        </>
      ) : !jobs.length ? (
        <p>No openings are currently published.</p>
      ) : (
        jobs.map((job) => (
          <article className="job-record" key={job.id}>
            <h2>{job.title}</h2>
            <p>
              {job.employment_type} · {job.workplace} · {job.location}
            </p>
            {job.salary && <p>{job.salary}</p>}
            <p className="job-prose">{job.description}</p>
            {job.requirements && (
              <>
                <h3>Requirements</h3>
                <p className="job-prose">{job.requirements}</p>
              </>
            )}
            {job.closes_at && <p>Apply by {new Date(job.closes_at).toLocaleDateString()}</p>}
            <button
              className="btn primary"
              onClick={() => {
                setSelected(job);
                setError('');
                setFile(null);
              }}
            >
              Apply for this job
            </button>
          </article>
        ))
      )}
      {selected && (
        <FormDialog title={`Apply: ${selected.title}`} busy={busy} onClose={() => setSelected(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                let resumeId;
                if (file) {
                  const upload = await request({
                    action: 'job.upload',
                    slug: ctx.slug,
                    jobId: selected.id,
                    name: file.name,
                    mime: file.type,
                    size: file.size,
                  });
                  await uploadToSigned(upload.path, upload.token, file, upload.bucket);
                  resumeId = upload.id;
                }
                await request({ action: 'job.apply', slug: ctx.slug, jobId: selected.id, ...form, resumeId });
                setSelected(null);
                setFile(null);
                setForm({ name: '', email: '', phone: '', resumeUrl: '', message: '', consent: false, shareProfile: false });
                setNotice('Application sent to the profile’s Inbox.');
              } catch (err) {
                setError(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset className="admin-form-body" disabled={busy}>
              <Field label="Your name">
                <input
                  required
                  maxLength={120}
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  required
                  maxLength={160}
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                />
              </Field>
              <Field label="Phone (optional)">
                <input
                  type="tel"
                  maxLength={40}
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                />
              </Field>
              <Field label="Upload résumé (PDF, DOC or DOCX, up to 5 MB)">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => setFile(e.target.files[0] || null)}
                />
              </Field>
              <Field label="Résumé link (optional when uploading)">
                <input
                  type="url"
                  value={form.resumeUrl}
                  onChange={(e) => update('resumeUrl', e.target.value)}
                />
              </Field>
              <Field label="Cover note">
                <textarea
                  rows={4}
                  maxLength={4000}
                  value={form.message}
                  onChange={(e) => update('message', e.target.value)}
                />
              </Field>
              <label>
                <input
                  type="checkbox"
                  required
                  checked={form.consent}
                  onChange={(e) => update('consent', e.target.checked)}
                />{' '}
                I consent to sharing my application and résumé with this profile’s administrators.
              </label>
              {isJobsProfile(user) && <label><input type="checkbox" checked={form.shareProfile} onChange={event => update('shareProfile', event.target.checked)} /> Include my Jobs Profile with this application. The receiving administrator can view Public and Applied jobs only sections; Private sections are never shared.</label>}
              <Notice kind="error">{error}</Notice>
              <button className="btn primary" disabled={busy}>
                {busy ? 'Sending application…' : 'Send application'}
              </button>
            </fieldset>
          </form>
        </FormDialog>
      )}
    </section>
  );
}
