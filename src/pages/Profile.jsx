import { useEffect, useState } from 'react';
import { Navigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { VISIBILITY_DEFAULTS } from '../../shared/profileSchema.js';
import { api } from '../lib/api.js';
import { LegacyPortfolioRedirect } from './LegacyRedirects.jsx';
import { QUESTIONS, emptyDraft, mergeDraft, missing } from '../lib/draft.js';
import { Busy, Loading, Notice, Pill } from '../components/Ui.jsx';
import WorkspaceSetup from '../components/WorkspaceSetup.jsx';
import { normalizeOrganizationDraft, ORGANIZATION_QUESTIONS } from '../../shared/organization.js';
import DraftEditor from '../components/profile/DraftEditor.jsx';
import VisibilityEditor from '../components/profile/VisibilityEditor.jsx';
import Icon from '../components/portfolio/Icon.jsx';

const PLACEHOLDER = 'Tell us about yourself, your education, professional experience, expertise, and what you would like to contribute to our platform.';

// ------------------------------------------------------------------ registration: write -> review -> publish
function Onboarding({ onDone, type = 'individual' }) {
  const organization = type === 'organization';
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const [res, setRes] = useState(null), [draft, setDraft] = useState(() => organization ? normalizeOrganizationDraft() : emptyDraft()), [extra, setExtra] = useState('');
  const [vis, setVis] = useState(structuredClone(VISIBILITY_DEFAULTS)), [ok, setOk] = useState(false);

  async function run(source, merge) {
    setBusy(true); setErr('');
    try {
      const r = await api('profile.extract', { text: source });
      setRes(r); setText(source); setDraft(d => (merge ? mergeDraft(d, r.draft) : r.draft)); setExtra('');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  async function publish() {
    setBusy(true); setErr('');
    try { onDone(await api('profile.confirm', { submissionId: res.submissionId, draft, visibility: vis, confirmed: ok })); } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  if (!res) {
    return (
      <>
        <div className="head" style={{ marginBottom: 6 }}>
          <div>
            <h1>{organization ? 'Create your organization profile' : 'Create Your AI Persona Profile'}</h1>
            <p className="muted" style={{ margin: 0 }}>
              {organization ? 'Tell us what your organization does, who it serves and how its persona should help people.' : 'Introduce yourself in your own words, and our model will extract and organize your knowledge base.'}
            </p>
          </div>
        </div>

        <div className="ux-step-cards">
          <div className="ux-step-card">
            <div className="ux-step-num">1</div>
            <h5>{organization ? 'Describe your organization' : 'Write or Paste Bio'}</h5>
            <p>{organization ? 'Paste your introduction or describe your services, programs and audience.' : 'Paste notes, your resume summary, or write in conversational plain text.'}</p>
          </div>
          <div className="ux-step-card">
            <div className="ux-step-num">2</div>
            <h5>AI Structured Extraction</h5>
            <p>{organization ? 'AI prepares a draft using only the information you provide.' : 'Our model organizes your background, education, and skills into clean categories.'}</p>
          </div>
          <div className="ux-step-card">
            <div className="ux-step-num">3</div>
            <h5>Review & Publish</h5>
            <p>Fine-tune privacy settings and publish your unified public portfolio & chatbot.</p>
          </div>
        </div>

        <section className="card">
          <label className="f">
            <strong>{organization ? 'About your organization' : 'About You & Background'}</strong>
            <textarea
              rows={10}
              style={{ fontFamily: 'inherit', fontSize: '1rem', marginTop: 4 }}
              aria-label={organization ? 'About your organization' : 'About you'}
              placeholder={organization ? 'Include your organization name, type, what you do, who you serve, and what your persona should help people understand.' : PLACEHOLDER}
              value={text}
              onChange={e => setText(e.target.value)}
              maxLength={6000}
            />
          </label>
          <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
            <button
              className="btn primary"
              disabled={busy || text.trim().length < 20}
              onClick={() => run(text, false)}
            >
              <Icon n="spark" size={18} />{busy ? 'Extracting your details with AI…' : 'Build my profile'}
            </button>
            <span className="muted" style={{ fontSize: '.85rem' }}>{text.length} / 6000 characters</span>
          </div>
          {busy && <Busy label="Preparing your profile draft…" />}
          <Notice kind="error">{err}</Notice>
        </section>
      </>
    );
  }

  const m = missing(draft), blocked = m.required.length > 0;
  return (
    <>
      <h1>Check your profile</h1>
      <p className="muted">This is what we understood. Nothing is saved or public yet. Edit anything, remove what's wrong, and add what's missing.</p>
      {res.notes.map((n, i) => <Notice key={i} kind="warn">{n}</Notice>)}
      {res.clarifications.length > 0 && <Notice kind="info"><b>A few things weren't clear:</b><ul>{res.clarifications.map((c, i) => <li key={i}>{c}</li>)}</ul></Notice>}
      {(m.required.length > 0 || m.optional.length > 0) && (
        <section className="card">
          <h3>Missing information</h3>
          <ul style={{ margin: '0 0 10px', paddingLeft: 18 }}>
            {m.required.map(k => <li key={k}><b>{(organization ? ORGANIZATION_QUESTIONS : QUESTIONS)[k]}</b> <span className="pill draft">needed</span></li>)}
            {m.optional.map(k => <li key={k} className="muted">{(organization ? ORGANIZATION_QUESTIONS : QUESTIONS)[k]}</li>)}
          </ul>
          <textarea rows={3} aria-label="Add more details" placeholder="Add details here and we'll update the profile (anything you've already filled in is kept)" value={extra} onChange={e => setExtra(e.target.value)} />
          <button className="btn" style={{ marginTop: 8 }} disabled={busy || extra.trim().length < 3} onClick={() => run(`${text}\n${extra.trim()}`, true)}>{busy ? 'Updating…' : 'Update from this'}</button>
        </section>
      )}
      <fieldset className="admin-form-body" disabled={busy}><DraftEditor draft={draft} onChange={setDraft} /></fieldset>
      <section className="card">
        <h3>What will be public?</h3>
        <p className="muted">You can change this any time. Contact details stay private unless you tick them.</p>
        <VisibilityEditor value={vis} onChange={setVis} organization={organization} />
      </section>
      <section className="card">
        <label className="toggle"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} /> I've reviewed this and it's accurate.</label>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={busy || blocked || !ok} onClick={publish}>{busy ? 'Saving…' : 'Confirm and publish my profile'}</button>
          <button className="btn" disabled={busy} onClick={() => { setRes(null); }}>Start over</button>
        </div>
        {blocked && <p className="muted">Still needed: {m.required.join(' and ')}.</p>}
        <Notice kind="error">{err}</Notice>
        {busy && <Busy label="Saving your reviewed profile…" />}
      </section>
    </>
  );
}

// ------------------------------------------------------------------ after registration: manage
const toDraft = p => ({ profile: { name: p.name, ...(p.profile_type === 'organization' ? { organization: p.organization || {} } : {}), education: p.education || [], contact: { email: null, phone: null, location: null, other: null, ...(p.contact || {}) },
  experience: { total_years: null, description: '', employers: [], ...(p.experience || {}) }, designation: p.designation, expertise: p.expertise || [] }, purpose: { description: p.purpose || '', contributions: [] } });

export function ProfileManager({ data, reload }) {
  const { profile: p, contributions } = data;
  const [params] = useSearchParams();
  const tab = params.get('tab') === 'contrib' ? 'contrib' : 'profile';
  const [draft, setDraft] = useState(toDraft(p)), [msg, setMsg] = useState(null);
  const [slug, setSlug] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(toDraft(p)); }, [p.updated_at, p.status]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api('auth.me').then(r => setSlug(r.user?.slug)); }, []);
  const flash = (kind, t) => { setMsg({ kind, t }); setTimeout(() => setMsg(null), 3500); };
  const guard = fn => async () => { if (saving) return; setSaving(true); try { await fn(); } catch (e) { setMsg({ kind: 'error', t: e.message }); } finally { setSaving(false); } };

  if (params.get('tab') === 'contrib') return <Navigate to={`/admin/store?tab=categories${params.get('action') === 'add' ? '&action=add' : ''}`} replace />;
  if (params.get('tab') === 'visibility') return <LegacyPortfolioRedirect tab="privacy" />;

  return (
    <>
      <div className="head" style={{ marginBottom: 8 }}>
        <div>
          <h1>{tab === 'contrib' ? 'Offerings & categories' : 'Profile'}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {tab === 'contrib' ? 'Manage the categories and offerings published in your Store.' : p.profile_type === 'organization' ? 'Manage your organization information. Public page design and privacy are managed in Settings.' : 'Manage your personal identity, bio and background. Public page design and privacy are managed in Settings.'}
          </p>
        </div>
        <div className="row">
          <Pill status={p.status} />
          {slug && p.status === 'published' && (
            <a className="btn" href={`/p/${slug}`} target="_blank" rel="noreferrer">
              View Public Page ↗
            </a>
          )}
          <button
            className="btn"
            disabled={saving}
            onClick={guard(async () => {
              await api('profile.status', { status: p.status === 'published' ? 'draft' : 'published' });
              reload();
            })}
          >
            {p.status === 'published' ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      </div>

      <div className="ux-guide-banner">
        <div className="ux-guide-icon"><Icon n="users" size={24} /></div>
        <div className="ux-guide-content">
          <h4>Your profile provides context</h4>
          <p>
            Your bio, education, and experience serve as the permanent knowledge baseline for your AI Persona.
            Review the details you publish so visitors receive useful context about your work.
          </p>
        </div>
      </div>

      <Notice kind={msg?.kind}>{msg?.t}</Notice>

      {tab === 'profile' && (
        <>
          <fieldset className="admin-form-body" disabled={saving}><DraftEditor draft={draft} onChange={setDraft} withContributions={false} /></fieldset>
          <div style={{ marginTop: 14 }}>
            <button
              className="btn primary"
              disabled={saving}
              onClick={guard(async () => {
                await api('profile.save', { draft: draft.profile, purpose: draft.purpose.description });
                reload();
                flash('success', 'Profile details saved successfully.');
              })}
            >
              {saving ? 'Saving profile…' : 'Save Profile Changes'}
            </button>
          </div>
          {saving && <Busy label="Saving profile changes…" />}
        </>
      )}


    </>
  );
}

function ProfileContent({ type }) {
  const { setNeeds } = useOutletContext();
  const [data, setData] = useState(null), [error, setError] = useState('');
  const reload = () => api('profile.get').then(setData, e => setError(e.message));
  useEffect(() => { reload(); }, []);
  if (!data) return <><Loading error={error} label="Opening your profile…" />{error && <button className="btn" onClick={reload}>Retry</button>}</>;
  if (!data.profile) return <Onboarding type={type} onDone={d => { setData(d); setNeeds(false); window.dispatchEvent(new Event('studio-changed')); }} />;
  return <ProfileManager data={data} reload={reload} />;
}
export default function Profile() { return <WorkspaceSetup>{type => <ProfileContent type={type} />}</WorkspaceSetup>; }
