import { useEffect, useState } from 'react';
import { Navigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { Field, Loading, Notice } from '../components/Ui.jsx';
import JobsProfileView from '../components/JobsProfileView.jsx';
import { JOBS_PROFILE_SECTIONS, JOBS_PROFILE_KNOWLEDGE, JOBS_PROFILE_AUDIENCES, isJobsProfile, visibleJobsProfile } from '../../shared/jobsProfile.js';
import '../styles/jobsProfile.css';

const QUESTIONS = {
  mindset: [['natural', 'Be Natural', 'When do you feel most like yourself? How do you stay authentic at work?'], ['positive', 'Be Positive', 'How do you respond to a setback? Share a real example.'], ['mindset', 'Mindset', 'How do you learn, handle feedback and work with people who disagree with you?']],
  direction: [['development', 'Job, Family Business & Enterprise Development', 'What are you doing now, and how would you like to develop it?']],
  business: [['thoughts', 'Profit Making Business & Understanding', 'What makes a business profitable? Share your thoughts or experience.']],
  interests: [['industry', 'Industry', 'Which industries interest you?'], ['domain', 'Domain', 'Which areas of work would you like to explore?'], ['scope', 'Scope', 'What would you like to learn, build or contribute?']],
  nation: [['idea', 'Idea for Nation Growth', 'Describe your idea and the problem it could solve.'], ['resources', 'Right resources', 'What people, expertise or resources would help?'], ['viability', 'Viability checks', 'What would you need to test before moving forward?']],
  hustles: [['story', 'Side Hustles — Story', 'Tell the story of a side project or business.'], ['notes', 'Notes', 'What are you trying, learning or planning?']],
  inspiration: [['inspiring', 'Who or what inspires you?', 'Share an inspirational story and why it matters to you.'], ['lessons', 'Lessons learned', 'How has that inspiration influenced your actions?'], ['not_inspiring', 'What does not inspire you?', 'Which approaches do not resonate with you, and why?']],
};
// Keep unsaved drafts across in-app navigation without putting private answers on disk.
const draftCache = new Map();
if (typeof window !== 'undefined') window.addEventListener('persona-signed-out', () => draftCache.clear());
function Input({ label, value, onChange, max = 160, type = 'text', required = false }) {
  return <Field label={label}><input type={type} required={required} maxLength={max} value={value || ''} onChange={event => onChange(event.target.value)} /></Field>;
}
function RepeatingFields({ title, values = [], fields, onChange }) {
  const patch = (index, key, value) => onChange(values.map((row, at) => at === index ? { ...row, [key]: value } : row));
  return <section className="jobs-profile-repeat"><h3>{title}</h3>{values.map((row, index) => <fieldset key={index}><legend>{title} entry {index + 1}</legend><div className="jobs-profile-grid">{fields.map(([key, label, max = 160]) => max > 1000 ? <Field key={key} label={label}><textarea rows={4} maxLength={max} value={row[key] || ''} onChange={event => patch(index, key, event.target.value)} /></Field> : <Input key={key} label={label} value={row[key]} max={max} onChange={value => patch(index, key, value)} />)}</div><button className="btn small" type="button" onClick={() => onChange(values.filter((_, at) => at !== index))} aria-label={`Remove ${title} entry ${index + 1}`}>Remove entry</button></fieldset>)}{!values.length && <p className="muted">No entries added yet.</p>}<button className="btn" type="button" disabled={values.length >= 20} onClick={() => onChange([...values, {}])}>Add {title.toLowerCase()} entry</button></section>;
}
function BasicFields({ value, change }) {
  return <><div className="jobs-profile-grid"><Input label="Name" required value={value.name} max={120} onChange={name => change({ name })} /><Input label="Professional headline" value={value.headline} onChange={headline => change({ headline })} /><Input label="Contact email" type="email" value={value.email} onChange={email => change({ email })} /><Input label="Contact phone" type="tel" value={value.phone} max={40} onChange={phone => change({ phone })} /><Input label="Location" value={value.location} onChange={location => change({ location })} /></div><Field label="About you"><textarea rows={4} maxLength={3000} value={value.summary || ''} onChange={event => change({ summary: event.target.value })} /></Field>
    <RepeatingFields title="Education & Academics" values={value.education} fields={[['qualification', 'Qualification'], ['institution', 'Institution'], ['year', 'Year', 40]]} onChange={education => change({ education })} />
    <RepeatingFields title="Certificates" values={value.certificates} fields={[['title', 'Certificate'], ['issuer', 'Issuer'], ['year', 'Year', 40]]} onChange={certificates => change({ certificates })} />
    <RepeatingFields title="Languages Known" values={value.languages} fields={[['name', 'Language', 80], ['proficiency', 'Proficiency', 80]]} onChange={languages => change({ languages })} />
  </>;
}
function ExperienceFields({ value, change }) {
  const fields = [['employer', 'Employer or business'], ['role', 'Role'], ['from', 'From', 40]];
  return <><RepeatingFields title="Current experience" values={value.current} fields={[...fields, ['description', 'Responsibilities & achievements', 3000]]} onChange={current => change({ current })} /><RepeatingFields title="Previous experience" values={value.previous} fields={[...fields, ['to', 'To', 40], ['description', 'Responsibilities & achievements', 3000]]} onChange={previous => change({ previous })} /></>;
}
export default function JobsProfileHome() {
  const { user } = useAuth(), { workspace } = useOutletContext();
  const scopedUser = { ...user, workspaceType: workspace?.workspace?.type ?? user?.profileType };
  if (!isJobsProfile(scopedUser)) return <Navigate to="/admin/profile" replace />;
  const scope = workspace?.workspace?.id || user.id;
  return <JobsHomeEditor key={`${user.id}:${scope}`} user={user} slug={workspace?.workspace?.slug || user.slug} scope={scope} />;
}
function JobsHomeEditor({ user, slug, scope }) {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const cacheKey = `${user.id}:${scope}`;
  const [drafts, setDraftState] = useState(() => draftCache.get(cacheKey) || {});
  const setDrafts = value => setDraftState(previous => { const next = typeof value === 'function' ? value(previous) : value; if (Object.keys(next).length) draftCache.set(cacheKey, next); else draftCache.delete(cacheKey); return next; });
  const tab = params.get('tab') === 'page' ? 'page' : 'profile';
  const enabled = data?.enabledSections || [];
  const group = ['basics', 'experience', 'knowledge'].includes(params.get('section')) ? params.get('section') : 'basics';
  const knowledge = JOBS_PROFILE_KNOWLEDGE.filter(key => enabled.includes(key));
  const requested = group === 'knowledge' ? params.get('topic') : group;
  const section = group === 'knowledge' ? knowledge.includes(requested) ? requested : knowledge[0] : requested;
  const key = tab === 'page' ? 'home' : section;
  const reload = async () => { setError(''); try { setData(await api('jobsProfile.get')); } catch (failure) { setError(failure.message); } };
  useEffect(() => { let active = true; api('jobsProfile.get').then(result => { if (active) setData(result); }, failure => { if (active) setError(failure.message); }); return () => { active = false; }; }, [scope, JSON.stringify(user.jobsProfilePermissions)]);
  useEffect(() => {
    const warn = event => { if (Object.keys(drafts).length) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [drafts]);
  if (!data) return <><Loading error={error} label="Opening your Jobs Profile…" />{error && <button className="btn" onClick={reload}>Retry</button>}</>;
  const current = drafts[key] || (key === 'home' ? { value: data.home, published: data.published } : data.sections[key] || { audience: 'private', value: key === 'basics' ? { name: user.name || '' } : {} });
  const update = patch => setDrafts(previous => ({ ...previous, [key]: { ...current, ...patch } }));
  const change = patch => update({ value: { ...current.value, ...patch } });
  const navigate = next => { setParams(next); setError(''); setNotice(''); };
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const result = await api('jobsProfile.save', { section: key, version: data.version, ...current });
      setData(result); setDrafts(previous => { const next = { ...previous }; delete next[key]; return next; });
      setNotice(key === 'home' ? 'Home page settings saved.' : `${JOBS_PROFILE_SECTIONS[key]} saved.`);
      window.dispatchEvent(new Event('studio-changed'));
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  const previewDocument = { ...data, home: drafts.home?.value || data.home };
  return <div className="jobs-home-editor">
    <div className="head"><div><h1>HOME</h1><p className="muted">Your Jobs Profile, experience and interests.</p></div>{data.published && <a className="btn" href={`/p/${slug}`} target="_blank" rel="noreferrer">View Home page</a>}</div>
    <nav className="jobs-profile-tabs" aria-label="HOME pages"><button className={tab === 'profile' ? 'active' : ''} aria-current={tab === 'profile' ? 'page' : undefined} disabled={busy} onClick={() => navigate({ tab: 'profile', section: group })}>Profile</button><button className={tab === 'page' ? 'active' : ''} aria-current={tab === 'page' ? 'page' : undefined} disabled={busy} onClick={() => navigate({ tab: 'page' })}>Public page editor</button></nav>
    {tab === 'profile' && <><nav className="jobs-profile-tabs is-secondary" aria-label="Profile sections">{[['basics', 'Basic Details'], ['experience', 'Working Experience — Current & Previous'], ['knowledge', 'Knowledgebase']].filter(([id]) => id === 'knowledge' ? knowledge.length : enabled.includes(id)).map(([id, label]) => <button key={id} disabled={busy} className={group === id ? 'active' : ''} aria-current={group === id ? 'page' : undefined} onClick={() => navigate({ tab: 'profile', section: id })}>{label}</button>)}</nav>{group === 'knowledge' && knowledge.length > 0 && <Field label="Knowledgebase topic"><select disabled={busy} value={section} onChange={event => navigate({ tab: 'profile', section: 'knowledge', topic: event.target.value })}>{knowledge.map(id => <option key={id} value={id}>{JOBS_PROFILE_SECTIONS[id]}</option>)}</select></Field>}</>}
    <Notice kind="success">{notice}</Notice><Notice kind="error">{error}</Notice>
    {error && <button className="btn" disabled={busy} onClick={reload}>Reload saved profile (keep drafts)</button>}
    {tab === 'profile' && !enabled.includes(key) ? <Notice>This section is hidden by your role permissions. Superadmin can change section access in Master.</Notice> : <form className="card jobs-profile-editor" onSubmit={save}>
      <fieldset className="admin-form-body" disabled={busy}><h2>{key === 'home' ? 'Home page editor' : JOBS_PROFILE_SECTIONS[key]}</h2>
        {key !== 'home' && <><Field label="Who can see this section?"><select value={current.audience} onChange={event => update({ audience: event.target.value })}>{Object.entries(JOBS_PROFILE_AUDIENCES).filter(([audience]) => key !== 'nation' || audience !== 'public').map(([audience, label]) => <option key={audience} value={audience}>{label}</option>)}</select></Field><p className="muted">Private sections are visible to you and authorised Superadmin reviewers. Applied jobs only sections are shared with the administrator of a job when you choose to include your Jobs Profile with your application. Change to Private to stop future access.</p></>}
        {key === 'basics' ? <BasicFields value={current.value} change={change} /> : key === 'experience' ? <ExperienceFields value={current.value} change={change} /> : key === 'home' ? <>
          <Input label="Home page title" value={current.value.title} onChange={title => change({ title })} />
          <Field label="Home page introduction"><textarea rows={5} maxLength={3000} value={current.value.introduction || ''} onChange={event => change({ introduction: event.target.value })} /></Field>
          <Input label="Profile photo URL (HTTPS)" type="url" max={1000} value={current.value.photo} onChange={photo => change({ photo })} />
          <div className="jobs-profile-grid"><Field label="Home page theme"><select value={current.value.theme || 'light'} onChange={event => change({ theme: event.target.value })}><option value="light">Light</option><option value="dark">Dark</option></select></Field><Input label="Accent colour" type="color" value={current.value.accent || '#166534'} onChange={accent => change({ accent })} /></div>
          <label className="jobs-profile-publish"><input type="checkbox" checked={current.published} onChange={event => update({ published: event.target.checked })} />Publish Home page</label><p className="muted">The title, introduction and photo appear publicly when published. Only profile sections set to Public appear below them. Private and Applied jobs only sections stay off this page.</p>
        </> : <>{key === 'direction' && <Field label="What are you mostly into?"><select value={current.value.focus || ''} onChange={event => change({ focus: event.target.value })}><option value="">Choose your direction</option>{['Job', 'Family Business', 'Enterprise Development'].map(focus => <option key={focus}>{focus}</option>)}</select></Field>}{key === 'nation' && <p className="muted">Your idea stays off the public page. Use these notes to describe the resources and viability checks you would need.</p>}{(QUESTIONS[key] || []).map(([field, label, prompt]) => <Field key={field} label={label}><span className="jobs-profile-prompt">{prompt}</span><textarea rows={5} maxLength={6000} value={current.value[field] || ''} onChange={event => change({ [field]: event.target.value })} /></Field>)}</>}
        <div className="row"><button className="btn primary" type="submit">{busy ? 'Saving…' : key === 'home' ? 'Save Home page' : 'Save section'}</button>{drafts[key] && <button className="btn" type="button" onClick={() => setDrafts(previous => { const next = { ...previous }; delete next[key]; return next; })}>Discard section changes</button>}</div>
      </fieldset>
    </form>}
    {tab === 'page' && <section className="jobs-home-preview"><h2>Public Home page preview</h2><JobsProfileView data={visibleJobsProfile(previewDocument, 'public', enabled)} preview embedded /></section>}
    <p className="muted jobs-profile-saved">{Object.keys(drafts).length ? 'Unsaved changes are kept while you switch between these sections.' : 'All displayed changes are saved.'}</p>
  </div>;
}
