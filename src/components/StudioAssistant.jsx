import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { STUDIO_SHORTCUTS } from '../../shared/studio.js';
import { studioCatalog } from '../../shared/studioAssistant.js';
import { createStudioSession, initialStudioState } from '../lib/studioSession.js';
import Icon from './portfolio/Icon.jsx';
import '../styles/studioAssistant.css';

function Value({ value }) {
  const text = value === null || value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  return text.length > 2000 ? <details className="studio-review-value"><summary>{text.slice(0, 180)}… View full value</summary><pre>{text}</pre></details> : <pre className="studio-review-value">{text}</pre>;
}

export function StudioReview({ review, busy, onApprove, onDiscard }) {
  if (!review) return null;
  const pending = review.status === 'pending', expired = review.expiresAt && Date.parse(review.expiresAt) <= Date.now();
  return <section className="studio-review" aria-labelledby="studio-review-heading">
    <header><div><span className="studio-assistant-kicker">Proposed changes</span><h2 id="studio-review-heading">Review before applying</h2></div><span className="studio-review-status">{expired && pending ? 'Expired' : review.status}</span></header>
    <p className="studio-review-intro">{pending ? 'Check each change below. Nothing is applied until you choose Approve and apply.' : 'This saved review is shown for reference. Check its result below.'}</p>
    <div className="studio-review-changes">{review.changes.map(change => <article className={`studio-review-change ${change.kind}`} key={change.id}>
      <h3><span>{change.kind === 'delete' ? '−' : change.kind === 'create' ? '+' : '↔'}</span>{change.title}</h3>
      {change.warning && <p className="studio-review-warning">{change.warning}</p>}
      {change.affected?.length > 0 && <ul className="studio-review-affected">{change.affected.map(item => <li key={item.label}>{item.count} {item.label}</li>)}</ul>}
      {change.fields.length > 0 && <div className="studio-review-table" role="table" aria-label={change.title}>
        <div className="studio-review-row heading" role="row"><span role="columnheader">Field</span><span role="columnheader">Before</span><span role="columnheader">After</span></div>
        {change.fields.map(field => <div className="studio-review-row" role="row" key={field.path}><span className="studio-review-field" role="cell">{field.path}</span><div role="cell"><Value value={field.before} /></div><div role="cell"><Value value={field.after} /></div></div>)}
      </div>}
    </article>)}</div>
    {pending && <footer><p>{expired ? 'This draft has expired. Send a new command to review current data.' : 'You can discard this draft or send another command to revise it.'}</p><div><button type="button" className="btn" onClick={onDiscard} disabled={!!busy}>Discard</button><button type="button" className="btn primary" onClick={onApprove} disabled={!!busy || expired || !review.changes.length}>{busy === 'applying' ? 'Applying…' : 'Approve and apply'}</button></div></footer>}
  </section>;
}

export function StudioResult({ result, onCheck, busy }) {
  if (!result) return null;
  return <section className={`studio-result ${result.status}`} aria-label="Command result" role="status">
    <h2>{result.status === 'applied' ? 'Changes applied' : result.status === 'partial' ? 'Some changes completed' : result.status === 'cancelled' ? 'Draft discarded' : result.status === 'running' || result.status === 'unknown' ? 'Checking this command' : 'Command needs attention'}</h2>
    {result.warning && <p>{result.warning}</p>}
    {result.status === 'running' && <p>This command is running or was interrupted. Check its status and the linked admin pages before creating a new draft.</p>}
    {!!result.results?.length && <ul>{result.results.map((item, index) => <li key={index}><span className={`studio-result-dot ${item.status}`} />{item.href ? <Link to={item.href}>{item.title}</Link> : item.title}<small>{item.status.replace(/_/g, ' ')}</small>{item.warning && <p>{item.warning}</p>}</li>)}</ul>}
    {['running', 'unknown'].includes(result.status) && <button type="button" className="btn" onClick={onCheck} disabled={!!busy}>Check status</button>}
  </section>;
}

const PROMPTS = ['Create a writing template called ', 'Write a draft post about ', 'Update my persona greeting to ', 'Create a folder called '];

export default function StudioAssistant({ user, focusCommand, onApplied, call = api }) {
  const [state, setState] = useState(() => initialStudioState(user?.id));
  const inputRef = useRef(null), session = useRef(null), applied = useRef(onApplied);
  applied.current = onApplied;
  const { input, messages, review, result, error, busy } = state.userId === user?.id ? state : initialStudioState(user?.id);
  const setInput = value => session.current?.setInput(value);
  useEffect(() => { if (focusCommand) inputRef.current?.focus(); }, [focusCommand]);
  useEffect(() => {
    const current = createStudioSession({ userId: user?.id, call, publish: setState, onApplied: () => applied.current?.() });
    session.current = current; setState(current.snapshot()); current.recover();
    return () => { current.dispose(); if (session.current === current) session.current = null; };
  }, [user?.id, call]);
  const submit = event => { event.preventDefault(); session.current?.submit(); };
  return <>
    <form className="studio-command" onSubmit={submit} aria-busy={busy === 'planning'}>
      <Icon n="spark" size={24} /><label className="studio-sr-only" htmlFor="studio-command-input">What would you like to do?</label>
      <input id="studio-command-input" ref={inputRef} aria-label="What would you like to do?" value={input} onChange={event => setInput(event.target.value)} maxLength={2000} placeholder="e.g. “Create an event tomorrow at 5pm…”" autoComplete="off" disabled={!!busy} />
      <Link className="studio-attach" to="/admin/files?tab=upload" aria-label="Upload files" title="Upload files"><Icon n="attachment" size={21} /></Link>
      <button type="submit" className="studio-command-send" disabled={!!busy || !input.trim()} aria-label="Plan changes"><Icon n="send" size={20} /></button>
    </form>
    <div className="studio-suggestions"><p>Try something like:</p><div>{STUDIO_SHORTCUTS.map((item, index) => <button type="button" key={item.label} className="studio-shortcut" disabled={!!busy} onClick={() => { setInput(PROMPTS[index]); inputRef.current?.focus(); }}><Icon n={item.icon} size={18} /><span>{item.label}</span></button>)}</div></div>
    <div className="studio-assistant-output">
      {!!messages.length && <div className="studio-admin-conversation" role="log" aria-label="Admin assistant conversation" aria-live="polite">{messages.map((message, index) => <article className={message.role} key={index}><span>{message.role === 'user' ? 'You' : 'Studio assistant'}</span><p>{message.text}</p></article>)}</div>}
      {busy === 'planning' && <p className="studio-assistant-wait" role="status">Reading the relevant admin records and preparing your review…</p>}
      {error && <p className="studio-assistant-error" role="alert">{error}</p>}
      <StudioReview review={review} busy={busy} onApprove={() => session.current?.approve()} onDiscard={() => session.current?.discard()} />
      <StudioResult result={result} busy={busy} onCheck={() => session.current?.checkStatus()} />
      <details className="studio-assistant-skills"><summary>What can I manage?</summary><div>{studioCatalog(user).map(item => <Link key={item.entity} to={item.href}><strong>{item.label}</strong><small>{item.modes.join(' · ')}</small></Link>)}</div></details>
    </div>
  </>;
}
