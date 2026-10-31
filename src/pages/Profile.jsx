import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { VISIBILITY_DEFAULTS } from '../../shared/profileSchema.js';
import { api } from '../lib/api.js';
import { QUESTIONS, emptyDraft, mergeDraft, missing } from '../lib/draft.js';
import { Loading, Notice, Pill } from '../components/Ui.jsx';
import DraftEditor from '../components/profile/DraftEditor.jsx';
import VisibilityEditor from '../components/profile/VisibilityEditor.jsx';
import Contributions from '../components/profile/Contributions.jsx';

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
        <h1>Introduce yourself</h1>
        <p className="muted">Write in any format you like: a paragraph, a few notes, a mix of personal and professional details. We'll organise it into a profile for you to check before anything is saved or published.</p>
        <section className="card">
          <textarea rows={11} style={{ fontFamily: 'inherit', fontSize: '1rem' }} aria-label="About you" placeholder={PLACEHOLDER} value={text} onChange={e => setText(e.target.value)} maxLength={6000} />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" disabled={busy || text.trim().length < 20} onClick={() => run(text, false)}>{busy ? 'Reading what you wrote…' : 'Build my profile'}</button>
            <span className="muted">{text.length} / 6000</span>
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

function Manager({ data, reload }) {
  const { profile: p, contributions } = data;
  const [tab, setTab] = useState('profile'), [draft, setDraft] = useState(toDraft(p)), [vis, setVis] = useState(p.visibility), [msg, setMsg] = useState(null);
  const [slug, setSlug] = useState(null);
  useEffect(() => { setDraft(toDraft(p)); setVis(p.visibility); }, [p.updated_at, p.status]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api('auth.me').then(r => setSlug(r.user?.slug)); }, []);
  const flash = (kind, t) => { setMsg({ kind, t }); setTimeout(() => setMsg(null), 3500); };
  const guard = fn => async () => { try { await fn(); } catch (e) { flash('error', e.message); } };

  return (
    <>
      <div className="head">
        <h1>Profile</h1>
        <div className="row">
          <Pill status={p.status} />
          {slug && p.status === 'published' && <a className="btn" href={`/p/${slug}`} target="_blank" rel="noreferrer">View public profile</a>}
          <button className="btn" onClick={guard(async () => { await api('profile.status', { status: p.status === 'published' ? 'draft' : 'published' }); reload(); })}>{p.status === 'published' ? 'Unpublish' : 'Publish'}</button>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {[['profile', 'Details'], ['visibility', 'Visibility'], ['contrib', 'Contributions & offerings']].map(([k, l]) => <button key={k} role="tab" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      <Notice kind={msg?.kind}>{msg?.t}</Notice>

      {tab === 'profile' && (
        <>
          <DraftEditor draft={draft} onChange={setDraft} withContributions={false} />
          <button className="btn primary" onClick={guard(async () => { await api('profile.save', { draft: draft.profile, purpose: draft.purpose.description }); reload(); flash('success', 'Saved.'); })}>Save changes</button>
        </>
      )}
      {tab === 'visibility' && (
        <section className="card">
          <h3>What visitors can see</h3>
          <VisibilityEditor value={vis} onChange={setVis} />
          <button className="btn primary" style={{ marginTop: 10 }} onClick={guard(async () => { await api('profile.visibility', { visibility: vis }); reload(); flash('success', 'Saved.'); })}>Save visibility</button>
        </section>
      )}
      {tab === 'contrib' && <Contributions items={contributions} reload={reload} />}
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
  return <Manager data={data} reload={reload} />;
}
