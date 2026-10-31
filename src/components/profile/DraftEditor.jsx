import { useState } from 'react';
import { CATEGORIES, INTENTS } from '../../../shared/profileSchema.js';
import { nextCategory } from '../../lib/draft.js';
import { Field } from '../Ui.jsx';

function Tags({ value, onChange }) {
  const [text, setText] = useState('');
  const add = () => { const t = text.trim(); if (t && !value.includes(t)) onChange([...value, t]); setText(''); };
  return (
    <div>
      <div className="chips">{value.map(t => <span className="chip" key={t}>{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter(x => x !== t))}>×</button></span>)}</div>
      <input type="text" value={text} placeholder="Type a skill and press Enter" onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }} onBlur={add} />
    </div>
  );
}

/** Edits the structured draft. Used during registration (with contributions) and later (profile fields only). */
export default function DraftEditor({ draft, onChange, withContributions = true }) {
  const up = fn => { const n = structuredClone(draft); fn(n); onChange(n); };
  const p = draft.profile, x = p.experience, ks = draft.purpose.contributions;
  const val = v => v ?? '';

  return (
    <>
      <section className="card">
        <h3>About you</h3>
        <div className="cols c2">
          <Field label="Full name *"><input type="text" value={val(p.name)} onChange={e => up(n => { n.profile.name = e.target.value; })} /></Field>
          <Field label="Current designation"><input type="text" value={val(p.designation)} onChange={e => up(n => { n.profile.designation = e.target.value; })} /></Field>
        </div>
        <Field label="Expertise"><Tags value={p.expertise} onChange={v => up(n => { n.profile.expertise = v; })} /></Field>
      </section>

      <section className="card">
        <h3>Education</h3>
        {p.education.map((e, i) => (
          <div className="row sub" key={i}>
            {[['qualification', 'Qualification'], ['specialization', 'Field of study'], ['institution', 'Institution']].map(([k, l]) => (
              <input key={k} type="text" className="grow" aria-label={l} placeholder={l} value={e[k]} onChange={ev => up(n => { n.profile.education[i][k] = ev.target.value; })} />
            ))}
            <button type="button" className="btn" onClick={() => up(n => { n.profile.education.splice(i, 1); })}>Remove</button>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => up(n => { n.profile.education.push({ qualification: '', specialization: '', institution: '' }); })}>Add education</button>
      </section>

      <section className="card">
        <h3>Working experience</h3>
        <div className="cols c2">
          <Field label="Total years"><input type="number" min={0} max={70} step="0.5" value={val(x.total_years)} onChange={e => up(n => { n.profile.experience.total_years = e.target.value === '' ? null : Number(e.target.value); })} /></Field>
        </div>
        <Field label="Summary"><textarea rows={3} value={x.description} onChange={e => up(n => { n.profile.experience.description = e.target.value; })} /></Field>
        {x.employers.map((e, i) => (
          <div className="row sub" key={i}>
            {[['company', 'Company'], ['role', 'Role'], ['duration', 'Duration']].map(([k, l]) => (
              <input key={k} type="text" className="grow" aria-label={l} placeholder={l} value={e[k]} onChange={ev => up(n => { n.profile.experience.employers[i][k] = ev.target.value; })} />
            ))}
            <button type="button" className="btn" onClick={() => up(n => { n.profile.experience.employers.splice(i, 1); })}>Remove</button>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => up(n => { n.profile.experience.employers.push({ company: '', role: '', duration: '' }); })}>Add employer</button>
      </section>

      <section className="card">
        <h3>Contact details <span className="muted" style={{ fontSize: '.85rem', fontWeight: 400 }}>private unless you publish them</span></h3>
        <div className="cols c2">
          {[['email', 'Email'], ['phone', 'Phone'], ['location', 'Location'], ['other', 'Other']].map(([k, l]) => (
            <Field key={k} label={l}><input type={k === 'email' ? 'email' : 'text'} value={val(p.contact[k])} onChange={e => up(n => { n.profile.contact[k] = e.target.value; })} /></Field>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>Purpose to join</h3>
        <Field label="Why do you want to join?"><textarea rows={3} value={draft.purpose.description} onChange={e => up(n => { n.purpose.description = e.target.value; })} /></Field>
        {withContributions && (
          <>
            <h3 style={{ marginTop: 14 }}>What you want to contribute</h3>
            <p className="muted">Pick every category that applies. Say whether each is free or paid; nothing is assumed to be paid.</p>
            {ks.map((k, i) => (
              <div className="row sub" key={i}>
                <select aria-label="Category" style={{ width: 210 }} value={k.category} onChange={e => up(n => { n.purpose.contributions[i].category = e.target.value; })}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
                {k.category === 'Other Contributions' && <input type="text" aria-label="What kind" style={{ width: 150 }} placeholder="e.g. Workshops" value={k.subtype} onChange={e => up(n => { n.purpose.contributions[i].subtype = e.target.value; })} />}
                <input type="text" className="grow" aria-label="Description" placeholder="What will you offer?" value={k.description} onChange={e => up(n => { n.purpose.contributions[i].description = e.target.value; })} />
                <select aria-label="Free or paid" style={{ width: 130 }} value={k.intent} onChange={e => up(n => { n.purpose.contributions[i].intent = e.target.value; })}>{INTENTS.map(t => <option key={t}>{t}</option>)}</select>
                <button type="button" className="btn" onClick={() => up(n => { n.purpose.contributions.splice(i, 1); })}>Remove</button>
              </div>
            ))}
            <button type="button" className="btn" onClick={() => up(n => { n.purpose.contributions.push({ category: nextCategory(n.purpose.contributions), subtype: '', description: '', intent: 'unspecified' }); })}>Add contribution</button>
          </>
        )}
      </section>
    </>
  );
}
