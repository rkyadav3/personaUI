import { useEffect, useState } from 'react';
import { Navigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { VISIBILITY_DEFAULTS } from '../../shared/profileSchema.js';
import { api } from '../lib/api.js';
import { LegacyPortfolioRedirect } from './LegacyRedirects.jsx';
import { QUESTIONS, emptyDraft, mergeDraft, missing } from '../lib/draft.js';
import { Loading, Notice, Pill } from '../components/Ui.jsx';
import DraftEditor from '../components/profile/DraftEditor.jsx';
import VisibilityEditor from '../components/profile/VisibilityEditor.jsx';
import Icon from '../components/portfolio/Icon.jsx';

const PLACEHOLDER = 'Tell us about yourself, your education, professional experience, expertise, and what you would like to contribute to our platform.';

// ------------------------------------------------------------------ registration: write -> review -> publish
function Onboarding({ onDone }) {
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const [res, setRes] = useState(null), [draft, setDraft] = useState(emptyDraft()), [extra, setExtra] = useState('');
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
            <h1>Create Your AI Persona Profile</h1>
            <p className="muted" style={{ margin: 0 }}>
              Introduce yourself in your own words, and our model will extract and organize your knowledge base.
            </p>
          </div>
        </div>

        <div className="ux-step-cards">
          <div className="ux-step-card">
            <div className="ux-step-num">1</div>
            <h5>Write or Paste Bio</h5>
            <p>Paste notes, your resume summary, or write in conversational plain text.</p>
          </div>
          <div className="ux-step-card">
            <div className="ux-step-num">2</div>
            <h5>AI Structured Extraction</h5>
            <p>Our model organizes your background, education, and skills into clean categories.</p>
          </div>
          <div className="ux-step-card">
            <div className="ux-step-num">3</div>
            <h5>Review & Publish</h5>
            <p>Fine-tune privacy settings and publish your unified public portfolio & chatbot.</p>
          </div>
        </div>

        <section className="card">
          <label className="f">
            <strong>About You & Background</strong>
            <textarea
              rows={10}
              style={{ fontFamily: 'inherit', fontSize: '1rem', marginTop: 4 }}
              aria-label="About you"
              placeholder={PLACEHOLDER}
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
            {m.required.map(k => <li key={k}><b>{QUESTIONS[k]}</b> <span className="pill draft">needed</span></li>)}
            {m.optional.map(k => <li key={k} className="muted">{QUESTIONS[k]}</li>)}
          </ul>
          <textarea rows={3} aria-label="Add more details" placeholder="Add details here and we'll update the profile (anything you've already filled in is kept)" value={extra} onChange={e => setExtra(e.target.value)} />
          <button className="btn" style={{ marginTop: 8 }} disabled={busy || extra.trim().length < 3} onClick={() => run(`${text}\n${extra.trim()}`, true)}>{busy ? 'Updating…' : 'Update from this'}</button>
        </section>
      )}
      <DraftEditor draft={draft} onChange={setDraft} />
      <section className="card">
        <h3>What will be public?</h3>
        <p className="muted">You can change this any time. Contact details stay private unless you tick them.</p>
        <VisibilityEditor value={vis} onChange={setVis} />
      </section>
      <section className="card">
        <label className="toggle"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} /> I've reviewed this and it's accurate.</label>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={busy || blocked || !ok} onClick={publish}>{busy ? 'Saving…' : 'Confirm and publish my profile'}</button>
          <button className="btn" onClick={() => { setRes(null); }}>Start over</button>
        </div>
        {blocked && <p className="muted">Still needed: {m.required.join(' and ')}.</p>}
        <Notice kind="error">{err}</Notice>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ after registration: manage
const toDraft = p => ({ profile: { name: p.name, education: p.education || [], contact: { email: null, phone: null, location: null, other: null, ...(p.contact || {}) },
  experience: { total_years: null, description: '', employers: [], ...(p.experience || {}) }, designation: p.designation, expertise: p.expertise || [] }, purpose: { description: p.purpose || '', contributions: [] } });

export function ProfileManager({ data, reload }) {
  const { profile: p, contributions } = data;
  const [params] = useSearchParams();
  const tab = params.get('tab') === 'contrib' ? 'contrib' : 'profile';
  const [draft, setDraft] = useState(toDraft(p)), [msg, setMsg] = useState(null);
  const [slug, setSlug] = useState(null);
  useEffect(() => { setDraft(toDraft(p)); }, [p.updated_at, p.status]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api('auth.me').then(r => setSlug(r.user?.slug)); }, []);
  const flash = (kind, t) => { setMsg({ kind, t }); setTimeout(() => setMsg(null), 3500); };
  const guard = fn => async () => { try { await fn(); } catch (e) { flash('error', e.message); } };

  if (params.get('tab') === 'contrib') return <Navigate to={`/admin/store?tab=categories${params.get('action') === 'add' ? '&action=add' : ''}`} replace />;
  if (params.get('tab') === 'visibility') return <LegacyPortfolioRedirect tab="privacy" />;

  return (
    <>
      <div className="head" style={{ marginBottom: 8 }}>
        <div>
          <h1>{tab === 'contrib' ? 'Offerings & categories' : 'Profile'}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {tab === 'contrib' ? 'Manage the categories and offerings published in your Store.' : 'Manage your personal identity, bio and background. Public page design and privacy are managed in Settings.'}
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
          <DraftEditor draft={draft} onChange={setDraft} withContributions={false} />
          <div style={{ marginTop: 14 }}>
            <button
              className="btn primary"
              onClick={guard(async () => {
                await api('profile.save', { draft: draft.profile, purpose: draft.purpose.description });
                reload();
                flash('success', 'Profile details saved successfully.');
              })}
            >
              Save Profile Changes
            </button>
          </div>
        </>
      )}


    </>
  );
}

export default function Profile() {
  const { setNeeds } = useOutletContext();
  const [data, setData] = useState(null), [error, setError] = useState('');
  const reload = () => api('profile.get').then(setData, e => setError(e.message));
  useEffect(() => { reload(); }, []);
  if (!data) return <Loading error={error} />;
  if (!data.profile) return <Onboarding onDone={d => { setData(d); setNeeds(false); }} />;
  return <ProfileManager data={data} reload={reload} />;
}
