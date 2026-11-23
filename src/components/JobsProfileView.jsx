import { JOBS_PROFILE_SECTIONS } from '../../shared/jobsProfile.js';
import '../styles/jobsProfile.css';
const LABELS = { natural: 'Being natural', positive: 'Staying positive', mindset: 'Mindset', focus: 'Primary direction', development: 'Development', thoughts: 'Business thoughts', industry: 'Industry', domain: 'Domain', scope: 'Scope', idea: 'Idea', resources: 'Resources needed', viability: 'Viability', story: 'Story', notes: 'Notes', inspiring: 'Who or what inspires me', lessons: 'Lessons learned', not_inspiring: 'What does not inspire me' };
function Entries({ items, titleKey, subtitleKeys }) {
  return items?.length ? <div className="jobs-profile-entries">{items.map((item, index) => <article key={index}><h3>{item[titleKey]}</h3><p>{subtitleKeys.map(key => item[key]).filter(Boolean).join(' · ')}</p>{item.description && <p className="jobs-profile-prose">{item.description}</p>}</article>)}</div> : null;
}
export default function JobsProfileView({ data, preview = false, embedded = false }) {
  const home = data.home || {}, basics = data.sections?.basics?.value;
  const Container = embedded ? 'div' : 'main';
  return <div className={`jobs-profile-view${home.theme === 'dark' ? ' is-dark' : ''}${embedded ? ' is-embedded' : ''}`} style={{ '--jobs-accent': home.accent || '#166534' }}>
    <Container className="jobs-profile-document">
      {preview && <p role="status">Home page preview — only Public sections appear here.</p>}
      <header className="jobs-profile-identity">{home.photo && <img src={home.photo} alt="" referrerPolicy="no-referrer" />}<div><h1>{home.title || basics?.name || 'Jobs Profile'}</h1>{basics?.headline && <p className="jobs-profile-headline">{basics.headline}</p>}{home.introduction && <p className="jobs-profile-prose">{home.introduction}</p>}</div></header>
      {Object.entries(JOBS_PROFILE_SECTIONS).map(([key, title]) => {
        const section = data.sections?.[key];
        if (!section) return null;
        const value = section.value || {};
        return <section className="jobs-profile-section" key={key}><h2>{title}</h2>{key === 'basics' ? <>
          {value.name && <p><strong>{value.name}</strong></p>}{value.summary && <p className="jobs-profile-prose">{value.summary}</p>}
          <dl className="jobs-profile-facts">{['email', 'phone', 'location'].filter(field => value[field]).map(field => <div key={field}><dt>{field === 'email' ? 'Email' : field === 'phone' ? 'Phone' : 'Location'}</dt><dd>{value[field]}</dd></div>)}</dl>
          {!!value.education?.length && <><h3>Education & Academics</h3><Entries items={value.education} titleKey="qualification" subtitleKeys={['institution', 'year']} /></>}
          {!!value.certificates?.length && <><h3>Certificates</h3><Entries items={value.certificates} titleKey="title" subtitleKeys={['issuer', 'year']} /></>}
          {!!value.languages?.length && <><h3>Languages Known</h3><p>{value.languages.map(language => [language.name, language.proficiency].filter(Boolean).join(' — ')).join(', ')}</p></>}
        </> : key === 'experience' ? <>
          {!!value.current?.length && <><h3>Current</h3><Entries items={value.current} titleKey="role" subtitleKeys={['employer', 'from']} /></>}
          {!!value.previous?.length && <><h3>Previous</h3><Entries items={value.previous} titleKey="role" subtitleKeys={['employer', 'from', 'to']} /></>}
        </> : <dl className="jobs-profile-answers">{Object.entries(value).filter(([, answer]) => answer).map(([field, answer]) => <div key={field}><dt>{LABELS[field] || field}</dt><dd className="jobs-profile-prose">{answer}</dd></div>)}</dl>}</section>;
      })}
      {!Object.keys(data.sections || {}).length && <p>No profile sections are shared in this view.</p>}
    </Container>
  </div>;
}
