import { useState } from 'react';
import { api } from '../lib/api.js';
import { useOp } from '../lib/hooks.js';
import { Field, Loading, Notice, Confirm } from '../components/Ui.jsx';
import FormDialog from '../components/FormDialog.jsx';
import { JOB_TYPES, WORKPLACE_TYPES } from '../../shared/jobs.js';
const empty = () => ({
  title: '',
  description: '',
  requirements: '',
  location: '',
  employment_type: 'Full-time',
  workplace: 'On-site',
  salary: '',
  status: 'draft',
  closes_at: '',
});
export default function Jobs() {
  const { data, error, reload } = useOp('jobs.list');
  const [form, setForm] = useState(null),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(''),
    [notice, setNotice] = useState('');
  const field = (key, value) => setForm({ ...form, [key]: value });
  if (!data)
    return (
      <>
        <Loading error={error} label="Loading jobs…" />
        {error && (
          <button className="btn" onClick={reload}>
            Retry
          </button>
        )}
      </>
    );
  return (
    <>
      <div className="head">
        <div>
          <h1>Jobs</h1>
          <p className="muted">
            Publish openings on this profile. Applications and résumés arrive in Inbox → Enquiries.
          </p>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            setForm(empty());
            setFailure('');
          }}
        >
          Post a job
        </button>
      </div>
      <Notice kind="success">{notice}</Notice>
      <Notice kind="error">{failure}</Notice>
      <section className="card">
        <h2>Job postings</h2>
        {!data.length && (
          <p>No jobs yet. Create a draft and publish it when you are ready to accept applications.</p>
        )}
        {data.map((job) => (
          <article key={job.id} className="job-record">
            <h3>{job.title}</h3>
            <p>
              {job.employment_type} · {job.workplace} · {job.location || 'Location not specified'} ·{' '}
              {job.status}
            </p>
            <div className="row">
              <button
                className="btn"
                disabled={busy}
                onClick={() => {
                  setForm({
                    ...job,
                    closes_at: job.closes_at
                      ? new Date(
                          Date.parse(job.closes_at) - new Date(job.closes_at).getTimezoneOffset() * 60000
                        )
                          .toISOString()
                          .slice(0, 16)
                      : '',
                  });
                  setFailure('');
                }}
              >
                Edit job
              </button>
              <Confirm
                label="Delete job"
                warn="Delete this job? Existing Inbox applications will be retained."
                onConfirm={async () => {
                  setBusy(true);
                  try {
                    await api('jobs.delete', { id: job.id });
                    await reload();
                  } catch (e) {
                    setFailure(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </div>
          </article>
        ))}
      </section>
      {form && (
        <FormDialog
          title={form.id ? 'Edit job posting' : 'Post a job'}
          busy={busy}
          onClose={() => setForm(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setFailure('');
              try {
                await api('jobs.save', {
                  ...form,
                  closes_at: form.closes_at ? new Date(form.closes_at).toISOString() : null,
                });
                setForm(null);
                setNotice('Job posting saved.');
                await reload();
              } catch (err) {
                setFailure(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset className="admin-form-body" disabled={busy}>
              <Field label="Job title">
                <input
                  required
                  maxLength={160}
                  value={form.title}
                  onChange={(e) => field('title', e.target.value)}
                />
              </Field>
              <div className="row">
                <Field label="Employment type">
                  <select
                    value={form.employment_type}
                    onChange={(e) => field('employment_type', e.target.value)}
                  >
                    {JOB_TYPES.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Workplace type">
                  <select value={form.workplace} onChange={(e) => field('workplace', e.target.value)}>
                    {WORKPLACE_TYPES.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Location">
                <input
                  maxLength={160}
                  value={form.location}
                  onChange={(e) => field('location', e.target.value)}
                />
              </Field>
              <Field label="Job description">
                <textarea
                  required
                  minLength={20}
                  maxLength={12000}
                  rows={6}
                  value={form.description}
                  onChange={(e) => field('description', e.target.value)}
                />
              </Field>
              <Field label="Requirements and qualifications">
                <textarea
                  maxLength={6000}
                  rows={4}
                  value={form.requirements}
                  onChange={(e) => field('requirements', e.target.value)}
                />
              </Field>
              <Field label="Salary or compensation (optional)">
                <input
                  maxLength={160}
                  value={form.salary}
                  onChange={(e) => field('salary', e.target.value)}
                />
              </Field>
              <Field label="Closing date (optional)">
                <input
                  type="datetime-local"
                  value={form.closes_at}
                  onChange={(e) => field('closes_at', e.target.value)}
                />
              </Field>
              <Field label="Posting status">
                <select value={form.status} onChange={(e) => field('status', e.target.value)}>
                  <option value="draft">Draft</option>
                  <option value="published">Published — accepting applications</option>
                  <option value="closed">Closed</option>
                </select>
              </Field>
              <Notice kind="error">{failure}</Notice>
              <button className="btn primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save job posting'}
              </button>
            </fieldset>
          </form>
        </FormDialog>
      )}
    </>
  );
}
